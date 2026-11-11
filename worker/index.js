// Cloudflare Worker entry. Static files are served by the assets binding;
// this only handles /api/* (see run_worker_first in wrangler.jsonc) and the X sync cron.
import { onRequestGet as revenue, refreshRevenue } from "../functions/api/revenue.js";
import { guestbook } from "./guestbook.js";
import { github } from "./github.js";
import { syncX } from "./x-sync.js";
import { chinaRedirect, regionInfo } from "./china-mirror.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // One address for everyone: https, and www.evanshi.nz -> evanshi.nz
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.hostname.startsWith("www.") || (url.protocol === "http:" && !local)) {
      url.hostname = url.hostname.replace(/^www\./, "");
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    // Visitors in mainland China go to the faster mirror (off unless CN_MIRROR is set)
    const toMirror = chinaRedirect(request, env);
    if (toMirror) return toMirror;

    if (pathname === "/api/revenue" || pathname === "/api/revenue/projects") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
      }
      return revenue({ request, env, waitUntil: (p) => ctx.waitUntil(p) });
    }

    // Shows where Cloudflare thinks the visitor is, to check the China redirect
    if (pathname === "/api/region") return Response.json(regionInfo(request, env), { headers: { "Cache-Control": "no-store" } });

    if (pathname === "/api/guestbook") {
      try {
        return await guestbook(request, env);
      } catch (err) {
        console.error("guestbook", err);
        return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
      }
    }

    if (pathname === "/api/github") {
      try {
        return await github(request, env, ctx);
      } catch (err) {
        return Response.json({ error: String(err.message || err) }, { status: 502 });
      }
    }

    if (pathname.startsWith("/api/")) return Response.json({ error: "Not found" }, { status: 404 });
    return env.ASSETS.fetch(request);
  },

  // Cron Trigger (see "triggers" in wrangler.jsonc)
  async scheduled(controller, env, ctx) {
    if (controller.cron === "41 */12 * * *") {
      ctx.waitUntil(refreshRevenue(env));
    } else {
      ctx.waitUntil(syncX(env).catch((e) => console.error("x sync", e)));
    }
  },
};
