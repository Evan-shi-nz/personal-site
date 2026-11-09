// Cloudflare Pages Function: GET /api/revenue
// Reads Stripe with the public, balance-only key and returns totals only.
// The aggregation code is identical to the open-source verifier
// (functions/_lib/revenue.mjs === stripe-revenue-verifier/revenue.mjs).

import { aggregate, fetchAllBalanceTransactions, isForbidden } from "../_lib/revenue.mjs";

const CACHE_SECONDS = 6 * 60 * 60;
// Cloudflare's free plan allows 50 sub-requests per invocation; keep a margin.
const MAX_PAGES = 45;

export async function onRequestGet({ request, env, waitUntil }) {
  const key = env.PUBLIC_STRIPE_VERIFY_KEY;
  if (!key) return json({ error: "PUBLIC_STRIPE_VERIFY_KEY is not set" }, 500);
  if (!key.startsWith("rk_")) return json({ error: "Only a restricted key (rk_) may be used here" }, 500);

  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/revenue", request.url).href);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  try {
    // Refuse to publish numbers if the key could read customer data.
    if (!(await isForbidden(key, "/charges"))) {
      return json({ error: "The configured key can read charges. Replace it with a Balance-only key." }, 500);
    }
    const { transactions, complete } = await fetchAllBalanceTransactions(key, { maxPages: MAX_PAGES });
    const body = {
      generatedAt: new Date().toISOString(),
      complete,
      transactionCount: transactions.length,
      ...aggregate(transactions),
    };
    const res = json(body, 200, { "Cache-Control": `public, max-age=${CACHE_SECONDS}` });
    waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (err) {
    return json({ error: String(err.message || err) }, 502);
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      ...headers,
    },
  });
}
