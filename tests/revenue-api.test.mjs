// The /api/revenue Worker route with a fake Stripe API (no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, parseProjects } from "../functions/api/revenue.js";

const SAFE_A = "rk_live_AAAAsafe", SAFE_B = "rk_live_BBBBsafe", LEAKY = "rk_live_CCCCleaky";

globalThis.caches = { default: { match: async () => null, put: async () => {} } };
globalThis.fetch = async (url, init) => {
  const key = init.headers.Authorization.replace("Bearer ", "");
  const path = new URL(url).pathname;
  if (path === "/v1/charges" || path === "/v1/customers")
    return new Response("{}", { status: key === LEAKY ? 200 : 403 });
  const amount = key === SAFE_A ? 1000 : 2500;
  const data = [{ id: "t1", reporting_category: "charge", amount, fee: 50, currency: "usd", created: Math.floor(Date.now() / 1000) - 86400 }];
  return new Response(JSON.stringify({ data, has_more: false }));
};
const call = (env, path) =>
  onRequestGet({ request: new Request(`https://site.test${path}`), env, waitUntil: () => {} }).then(async (r) => ({ status: r.status, body: await r.json() }));

test("parses one project per line with optional TrustMRR link and public flag", () => {
  const env = { STRIPE_REVENUE_KEYS: `Tools=${SAFE_A} | trustmrr=https://trustmrr.com/startup/tools\n ${SAFE_B} | public\n` };
  assert.deepEqual(parseProjects(env), [
    { id: "1", label: "Tools", key: SAFE_A, trustmrr: "https://trustmrr.com/startup/tools", public: false },
    { id: "2", label: "Project 2", key: SAFE_B, trustmrr: null, public: true },
  ]);
  // older variable still works, and its keys were meant to be public
  assert.deepEqual(parseProjects({ PUBLIC_STRIPE_VERIFY_KEY: SAFE_A }).map((p) => [p.id, p.public]), [["1", true]]);
});

test("keeps keys on the server unless the project is public", async () => {
  const env = { STRIPE_REVENUE_KEYS: `A=${SAFE_A}\nB=${SAFE_B} | public` };
  const a = await call(env, "/api/revenue?project=1");
  const b = await call(env, "/api/revenue?project=2");
  assert.equal(a.body.currencies.usd.total.gross, 1000);
  assert.ok(!JSON.stringify(a.body).includes(SAFE_A));
  assert.equal(a.body.project.verifiable, false);
  assert.equal(b.body.verifyKey, SAFE_B);
  const list = await call(env, "/api/revenue/projects");
  assert.ok(!JSON.stringify(list.body).includes("rk_live"));
});

test("lists projects without keys", async () => {
  const { body } = await call({ STRIPE_REVENUE_KEYS: `A=${SAFE_A}\nB=${SAFE_B} | trustmrr=https://trustmrr.com/startup/b` }, "/api/revenue/projects");
  assert.deepEqual(body, { projects: [
    { id: "1", label: "A", trustmrr: null, verifiable: false },
    { id: "2", label: "B", trustmrr: "https://trustmrr.com/startup/b", verifiable: false },
  ] });
});

test("returns each project's own numbers and key", async () => {
  const env = { PUBLIC_STRIPE_VERIFY_KEYS: `A=${SAFE_A}\nB=${SAFE_B}` }; // older variable: keys are public
  const a = await call(env, "/api/revenue?project=1");
  const b = await call(env, "/api/revenue?project=2");
  assert.equal(a.body.currencies.usd.total.gross, 1000);
  assert.equal(b.body.currencies.usd.total.gross, 2500);
  assert.equal(b.body.verifyKey, SAFE_B);
  assert.equal(b.body.project.label, "B");
  assert.equal((await call(env, "/api/revenue")).body.project.id, "1"); // default project
  assert.equal((await call(env, "/api/revenue?project=9")).status, 404);
});

test("refuses a key that can read customer data and does not reveal it", async () => {
  const { status, body } = await call({ STRIPE_REVENUE_KEYS: `X=${LEAKY} | public` }, "/api/revenue?project=1");
  assert.equal(status, 500);
  assert.match(body.error, /customer data/);
  assert.ok(!JSON.stringify(body).includes(LEAKY));
});

test("explains when no keys are configured", async () => {
  const { status, body } = await call({}, "/api/revenue");
  assert.equal(status, 500);
  assert.match(body.error, /not set/);
});
