// Keeps each project's Stripe balance transactions in D1, so the site can show accounts with
// thousands of transactions on Cloudflare's free plan (50 outgoing requests per invocation).
//
// Each run: read the newest pages until it reaches transactions it already has, then, if the
// history is not complete yet, continue backwards from the oldest stored transaction. Whatever
// is left is picked up by the next request or the next cron run.
//
// Only what the totals need is stored: id, time, amount, fee, currency, reporting category.

import { STRIPE_API } from "../functions/_lib/revenue.mjs";

// Create tables once per database (per Worker instance).
const schemaReady = new WeakMap();
function ensureSchema(db) {
  if (!schemaReady.has(db)) schemaReady.set(db, db
    .batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS revenue_tx (
        project TEXT NOT NULL,
        id TEXT NOT NULL,
        created INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        fee INTEGER NOT NULL,
        currency TEXT NOT NULL,
        category TEXT NOT NULL,
        PRIMARY KEY (project, id)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS revenue_state (
        project TEXT PRIMARY KEY,
        oldest_id TEXT,
        complete INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT
      )`),
    ])
    .catch((err) => {
      schemaReady.delete(db);
      throw err;
    }));
  return schemaReady.get(db);
}

// Stable id for a key without storing the key itself. A new key means a fresh history.
export async function fingerprint(key) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function listPage(key, startingAfter) {
  const url = new URL(STRIPE_API + "/balance_transactions");
  url.searchParams.set("limit", "100");
  if (startingAfter) url.searchParams.set("starting_after", startingAfter);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2024-06-20" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe refused /balance_transactions: ${body?.error?.message || `HTTP ${res.status}`}`);
  return body;
}

async function save(db, project, txs) {
  if (txs.length === 0) return;
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO revenue_tx (project, id, created, amount, fee, currency, category) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  await db.batch(txs.map((t) => stmt.bind(project, t.id, t.created, t.amount, t.fee, t.currency, t.reporting_category)));
}

async function knownIds(db, project, ids) {
  if (ids.length === 0) return new Set();
  const { results } = await db
    .prepare(`SELECT id FROM revenue_tx WHERE project = ? AND id IN (SELECT value FROM json_each(?))`)
    .bind(project, JSON.stringify(ids))
    .all();
  return new Set(results.map((r) => r.id));
}

// Brings the stored history up to date using at most `maxPages` Stripe requests.
// Returns { transactions, complete, pagesUsed } with transactions shaped like Stripe's.
export async function syncTransactions(db, key, { maxPages = 45 } = {}) {
  await ensureSchema(db);
  const project = await fingerprint(key);
  const state = (await db.prepare(`SELECT oldest_id, complete FROM revenue_state WHERE project = ?`).bind(project).first()) ?? {
    oldest_id: null,
    complete: 0,
  };
  let pages = 0;
  let oldestId = state.oldest_id;
  let complete = Boolean(state.complete);

  // 1. Newest first, until we reach transactions we already have.
  let cursor;
  let reachedKnown = false;
  let walkedToEnd = false;
  while (pages < maxPages) {
    const page = await listPage(key, cursor);
    pages++;
    const known = await knownIds(db, project, page.data.map((t) => t.id));
    const fresh = page.data.filter((t) => !known.has(t.id));
    await save(db, project, fresh);
    if (!oldestId && page.data.length) oldestId = page.data[page.data.length - 1].id;
    if (known.size > 0) {
      reachedKnown = true;
      break;
    }
    if (!page.has_more) {
      walkedToEnd = true; // reached the very first transaction
      complete = true;
      oldestId = page.data.at(-1)?.id ?? oldestId;
      break;
    }
    cursor = page.data[page.data.length - 1].id;
    if (!state.oldest_id) oldestId = cursor; // first run: this walk is the backfill
  }
  // Ran out of requests before reaching stored data: there may be a gap below this point.
  // Restart the backfill from here; already stored rows are skipped on insert.
  if (!reachedKnown && !walkedToEnd && state.oldest_id) {
    oldestId = cursor;
    complete = false;
  }

  // 2. Older history that is still missing.
  while (!complete && oldestId && pages < maxPages) {
    const page = await listPage(key, oldestId);
    pages++;
    await save(db, project, page.data);
    if (page.data.length) oldestId = page.data[page.data.length - 1].id;
    if (!page.has_more) complete = true;
  }

  await db
    .prepare(
      `INSERT INTO revenue_state (project, oldest_id, complete, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (project) DO UPDATE SET oldest_id = excluded.oldest_id, complete = excluded.complete, updated_at = excluded.updated_at`,
    )
    .bind(project, oldestId, complete ? 1 : 0, new Date().toISOString())
    .run();

  const { results } = await db
    .prepare(`SELECT created, amount, fee, currency, category AS reporting_category FROM revenue_tx WHERE project = ?`)
    .bind(project)
    .all();
  return { transactions: results, complete, pagesUsed: pages };
}
