// Cloudflare Worker entry. Static files are served by the assets binding;
// this only handles /api/* (see run_worker_first in wrangler.jsonc).
import { onRequestGet as revenue } from "../functions/api/revenue.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/revenue") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
      }
      return revenue({ request, env, waitUntil: (p) => ctx.waitUntil(p) });
    }

    return env.ASSETS.fetch(request);
  },
};
