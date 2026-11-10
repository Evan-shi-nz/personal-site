// Cloudflare Worker entry. Static files are served by the assets binding;
// this only handles /api/* (see run_worker_first in wrangler.jsonc) and the X sync cron.
import { onRequestGet as revenue, refreshRevenue } from "../functions/api/revenue.js";
import { guestbook } from "./guestbook.js";
import { syncX } from "./x-sync.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/revenue" || pathname === "/api/revenue/projects") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
      }
      return revenue({ request, env, waitUntil: (p) => ctx.waitUntil(p) });
    }

    if (pathname === "/api/guestbook") {
      try {
        return await guestbook(request, env);
      } catch (err) {
        console.error("guestbook", err);
        return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
      }
    }

    if (pathname.startsWith("/api/")) return Response.json({ error: "Not found" }, { status: 404 });
    return env.ASSETS.fetch(request);
  },

  // Cron Trigger (see "triggers" in wrangler.jsonc)
  async scheduled(controller, env, ctx) {
    // Run one after the other: they share this invocation's outgoing-request limit.
    ctx.waitUntil(syncX(env).catch((e) => console.error("x sync", e)).then(() => refreshRevenue(env, { budget: 35 })));
  },
};
