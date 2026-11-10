// GET /api/revenue?project=1   one project's revenue (totals only) and its public key
// GET /api/revenue/projects    list of projects, no Stripe calls
//
// Each project is a separate Stripe account with a public, Balance-only restricted key.
// Keys come from the Cloudflare variable PUBLIC_STRIPE_VERIFY_KEYS, one per line or
// separated by commas, optionally named:
//
//   Project A=rk_live_...
//   Project B=rk_live_...
//
// (The older single-key variable PUBLIC_STRIPE_VERIFY_KEY still works as project 1.)
// The aggregation code is identical to the open-source verifier
// (functions/_lib/revenue.mjs === stripe-revenue-verifier/revenue.mjs).

import { aggregate, fetchAllBalanceTransactions, isForbidden } from "../_lib/revenue.mjs";
import { syncTransactions } from "../../worker/revenue-store.js";

const CACHE_SECONDS = 6 * 60 * 60;
// While a large history is still being copied into D1, let the next visitor continue soon.
const PARTIAL_CACHE_SECONDS = 60;
// Cloudflare's free plan allows 50 sub-requests per request: 2 permission checks + up to 45 pages.
const MAX_PAGES = 45;

export function parseProjects(env) {
  const raw = env.PUBLIC_STRIPE_VERIFY_KEYS || env.PUBLIC_STRIPE_VERIFY_KEY || "";
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const eq = entry.lastIndexOf("=");
      const key = (eq >= 0 ? entry.slice(eq + 1) : entry).trim();
      const label = (eq >= 0 ? entry.slice(0, eq).trim() : "") || `Project ${i + 1}`;
      return { id: String(i + 1), label, key };
    });
}

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const projects = parseProjects(env);
  const list = projects.map(({ id, label }) => ({ id, label }));

  if (url.pathname.endsWith("/projects")) return json({ projects: list }, 200, { "Cache-Control": "public, max-age=300" });
  if (projects.length === 0) return json({ projects: [], error: "PUBLIC_STRIPE_VERIFY_KEYS is not set" }, 500);

  const project = projects.find((p) => p.id === (url.searchParams.get("project") || "1"));
  if (!project) return json({ projects: list, error: "Unknown project" }, 404);
  const meta = { project: { id: project.id, label: project.label }, projects: list };
  if (!project.key.startsWith("rk_")) return json({ ...meta, error: "Only a restricted key (rk_) may be used here" }, 500);

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/revenue?project=${project.id}&k=${project.key.slice(-8)}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  try {
    // Refuse to publish anything (key included) if the key could read customer data.
    const [noCharges, noCustomers] = await Promise.all([isForbidden(project.key, "/charges"), isForbidden(project.key, "/customers")]);
    if (!noCharges || !noCustomers) {
      return json({ ...meta, error: "This project's key can read customer data. Replace it with a Balance-only key." }, 500);
    }
    // With D1 (the Worker's DB binding) history is kept between runs; without it, read what fits.
    const { transactions, complete } = env.DB
      ? await syncTransactions(env.DB, project.key, { maxPages: MAX_PAGES })
      : await fetchAllBalanceTransactions(project.key, { maxPages: MAX_PAGES });
    const body = {
      ...meta,
      verifyKey: project.key,
      generatedAt: new Date().toISOString(),
      complete,
      transactionCount: transactions.length,
      ...aggregate(transactions),
    };
    const res = json(body, 200, { "Cache-Control": `public, max-age=${complete ? CACHE_SECONDS : PARTIAL_CACHE_SECONDS}` });
    waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (err) {
    return json({ ...meta, verifyKey: project.key, error: String(err.message || err) }, 502);
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

// Cron: keep every project's stored history up to date (and finish large backfills)
// without waiting for a visitor. Projects share this invocation's request budget.
export async function refreshRevenue(env, { budget = MAX_PAGES, log = console.log } = {}) {
  if (!env.DB) return;
  for (const p of parseProjects(env)) {
    if (budget <= 2) break;
    try {
      budget -= 1;
      if (!(await isForbidden(p.key, "/charges"))) {
        log(`revenue: skipped ${p.label}, key can read charges`);
        continue;
      }
      const { complete, pagesUsed } = await syncTransactions(env.DB, p.key, { maxPages: budget });
      budget -= pagesUsed;
      log(`revenue: ${p.label} synced (${pagesUsed} pages, ${complete ? "complete" : "partial"})`);
    } catch (err) {
      log(`revenue: ${p.label} failed: ${err.message}`);
    }
  }
}
