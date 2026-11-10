// GET /api/revenue?project=1   one project's revenue totals (never transaction details)
// GET /api/revenue/projects    list of projects, no Stripe calls
//
// Each project is a separate Stripe account with a Balance-only restricted key, set in the
// Cloudflare secret STRIPE_REVENUE_KEYS, one project per line:
//
//   Project 1=rk_live_...
//   Project 2=rk_live_... | trustmrr=https://trustmrr.com/startup/your-startup
//   Project 3=rk_live_... | public
//
// Keys stay on the server unless a line ends with "| public"; then the page shows the key so
// visitors can check the numbers with the open-source verifier. "trustmrr=" adds a link to
// that project's TrustMRR page as third-party proof.
// (Older variables PUBLIC_STRIPE_VERIFY_KEYS / PUBLIC_STRIPE_VERIFY_KEY are still read; their
// keys are treated as public, as their names promised.)
// The aggregation code is identical to the open-source verifier
// (functions/_lib/revenue.mjs === stripe-revenue-verifier/revenue.mjs).

import { aggregate, fetchAllBalanceTransactions, isForbidden } from "../_lib/revenue.mjs";
import { syncTransactions } from "../../worker/revenue-store.js";

// Read new transactions from Stripe at most every 12 hours.
const CACHE_SECONDS = 12 * 60 * 60;
// Bump when the response shape changes, so cached responses from older code are not served.
const CACHE_VERSION = 2;
// Only while a large history is first being copied into D1: let the next visit continue soon.
const PARTIAL_CACHE_SECONDS = 60;
// Cloudflare's free plan allows 50 sub-requests per request: 2 permission checks + up to 45 pages.
const MAX_PAGES = 45;

export function parseProjects(env) {
  const legacy = !env.STRIPE_REVENUE_KEYS;
  const raw = env.STRIPE_REVENUE_KEYS || env.PUBLIC_STRIPE_VERIFY_KEYS || env.PUBLIC_STRIPE_VERIFY_KEY || "";
  return raw
    .split(/[\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [main, ...opts] = line.split("|").map((s) => s.trim());
      const eq = main.lastIndexOf("=");
      const key = (eq >= 0 ? main.slice(eq + 1) : main).trim();
      const label = (eq >= 0 ? main.slice(0, eq).trim() : "") || `Project ${i + 1}`;
      let trustmrr = null;
      let isPublic = legacy;
      for (const o of opts) {
        if (/^public$/i.test(o)) isPublic = true;
        const m = o.match(/^trustmrr\s*=\s*(https:\/\/\S+)$/i);
        if (m) trustmrr = m[1];
      }
      return { id: String(i + 1), label, key, trustmrr, public: isPublic };
    });
}

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const projects = parseProjects(env);
  const list = projects.map(({ id, label, trustmrr, public: isPublic }) => ({ id, label, trustmrr, verifiable: isPublic }));

  if (url.pathname.endsWith("/projects")) return json({ projects: list }, 200, { "Cache-Control": "public, max-age=300" });
  if (projects.length === 0) return json({ projects: [], error: "STRIPE_REVENUE_KEYS is not set" }, 500);

  const project = projects.find((p) => p.id === (url.searchParams.get("project") || "1"));
  if (!project) return json({ projects: list, error: "Unknown project" }, 404);
  const meta = { project: list.find((p) => p.id === project.id), projects: list };
  // The key leaves the server only for projects marked "public".
  const shownKey = project.public ? { verifyKey: project.key } : {};
  if (!project.key.startsWith("rk_")) return json({ ...meta, error: "Only a restricted key (rk_) may be used here" }, 500);

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/revenue?project=${project.id}&k=${project.key.slice(-8)}&v=${CACHE_VERSION}`);
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
      ...shownKey,
      generatedAt: new Date().toISOString(),
      complete,
      transactionCount: transactions.length,
      ...aggregate(transactions),
    };
    const res = json(body, 200, { "Cache-Control": `public, max-age=${complete ? CACHE_SECONDS : PARTIAL_CACHE_SECONDS}` });
    waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (err) {
    return json({ ...meta, ...shownKey, error: String(err.message || err) }, 502);
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
