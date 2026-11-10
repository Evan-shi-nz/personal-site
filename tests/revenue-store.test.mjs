// D1-backed revenue history: backfill across several runs, then only new transactions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeD1 } from "./helpers/fake-d1.mjs";
import { syncTransactions } from "../worker/revenue-store.js";

// Fake Stripe account: transactions newest first, like the real API.
function fakeStripe(count) {
  const txs = Array.from({ length: count }, (_, i) => ({
    id: `txn_${String(count - i).padStart(6, "0")}`, created: 1_700_000_000 + (count - i) * 60,
    amount: 1000, fee: 59, currency: "usd", reporting_category: "charge", description: "Subscription creation",
  }));
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    const u = new URL(url);
    const after = u.searchParams.get("starting_after");
    const start = after ? txs.findIndex((t) => t.id === after) + 1 : 0;
    const data = txs.slice(start, start + Number(u.searchParams.get("limit")));
    return new Response(JSON.stringify({ data, has_more: start + data.length < txs.length }));
  };
  return {
    txs,
    add(n) { // new payments arrive at the top
      const top = txs.length;
      for (let i = 1; i <= n; i++) txs.unshift({ ...txs[0], id: `txn_new_${top + i}`, created: txs[0].created + 60 });
    },
    get calls() { return calls; },
    reset() { calls = 0; },
  };
}

test("copies a large history over several runs, then fetches only new transactions", async () => {
  const db = fakeD1();
  const stripe = fakeStripe(1234); // 13 pages
  const key = "rk_live_test";

  let r = await syncTransactions(db, key, { maxPages: 5 });
  assert.equal(r.complete, false);
  assert.equal(r.transactions.length, 500);

  r = await syncTransactions(db, key, { maxPages: 5 }); // 1 page of "new" (all known) + 4 older pages
  assert.equal(r.complete, false);
  assert.equal(r.transactions.length, 900);

  r = await syncTransactions(db, key, { maxPages: 5 });
  assert.equal(r.complete, true);
  assert.equal(r.transactions.length, 1234);
  assert.equal(r.transactions.reduce((a, t) => a + t.amount, 0), 1234 * 1000);

  stripe.add(7);
  stripe.reset();
  r = await syncTransactions(db, key, { maxPages: 5 });
  assert.equal(stripe.calls, 1, "only the newest page is read once the history is complete");
  assert.equal(r.transactions.length, 1241);
  assert.equal(r.complete, true);
});

test("fills a gap when more new transactions arrived than one run can read", async () => {
  const db = fakeD1();
  const stripe = fakeStripe(150);
  const key = "rk_live_gap";
  assert.equal((await syncTransactions(db, key, { maxPages: 5 })).complete, true);
  stripe.add(450); // 4.5 pages of new payments
  let r = await syncTransactions(db, key, { maxPages: 2 }); // can't reach the stored ones
  assert.equal(r.complete, false);
  for (let i = 0; i < 5 && !r.complete; i++) r = await syncTransactions(db, key, { maxPages: 2 });
  assert.equal(r.complete, true);
  assert.equal(r.transactions.length, 600);
  assert.equal(new Set(r.transactions.map((t) => t.created + ":" + t.amount)).size > 0, true);
});

test("stores only what the totals need", async () => {
  const db = fakeD1();
  fakeStripe(3);
  await syncTransactions(db, "rk_live_cols", { maxPages: 5 });
  const cols = db.raw.prepare("PRAGMA table_info(revenue_tx)").all().map((c) => c.name);
  assert.deepEqual(cols, ["project", "id", "created", "amount", "fee", "currency", "category"]);
  assert.ok(!JSON.stringify(db.raw.prepare("SELECT * FROM revenue_tx").all()).includes("Subscription"));
  assert.ok(!JSON.stringify(db.raw.prepare("SELECT * FROM revenue_state").all()).includes("rk_live"));
});
