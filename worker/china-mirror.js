// Visitors in mainland China are sent to a mirror (for example https://cn.evanshi.nz) that runs on a
// relay server with a good route to China (see deploy/cn-mirror). The mirror fetches every page
// from this Worker, so the Worker still serves all content and the API.
//
// Settings (Cloudflare > Worker > Settings > Variables and Secrets):
//   CN_MIRROR      the mirror's address, e.g. "https://cn.evanshi.nz". Empty = no redirect.
//   CN_MIRROR_KEY  secret shared with the mirror. The mirror sends it with each request, together
//                  with the visitor's real IP, so the guestbook limits each visitor and not the mirror.

// Search engines and link previews always get the main site.
const BOTS = /bot|spider|crawl|slurp|baidu|sogou|bing|google|yandex|duckduck|facebookexternalhit|preview|lighthouse/i;

/** True when the request comes from our own mirror (it carries the shared key). */
export function fromMirror(request, env) {
  const key = env.CN_MIRROR_KEY;
  return typeof key === "string" && key.length >= 16 && request.headers.get("X-Mirror-Key") === key;
}

/** The visitor's IP: the real one for mirror requests, otherwise what Cloudflare saw. */
export function clientIp(request, env) {
  if (fromMirror(request, env)) return request.headers.get("X-Mirror-Client-IP") || "unknown";
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

/** A redirect to the mirror for page loads from mainland China, or null. */
export function chinaRedirect(request, env) {
  const mirror = (env.CN_MIRROR || "").trim();
  if (!mirror) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  // Cloudflare works out the country from the visitor's own IP address
  if (request.cf?.country !== "CN") return null;
  if (fromMirror(request, env)) return null;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return null;
  // Only page loads: images, scripts, RSS and the sitemap are served as usual
  if (!(request.headers.get("Accept") || "").includes("text/html")) return null;
  if (BOTS.test(request.headers.get("User-Agent") || "")) return null;
  let target;
  try {
    target = new URL(url.pathname + url.search, mirror);
  } catch {
    return null; // CN_MIRROR is not a valid address
  }
  if (target.host === url.host) return null;
  return new Response(null, { status: 302, headers: { Location: target.toString(), "Cache-Control": "private, no-store" } });
}

/** What the redirect decides for this visitor (shown at /api/region). */
export function regionInfo(request, env) {
  const country = request.cf?.country ?? null;
  const mirror = (env.CN_MIRROR || "").trim() || null;
  return {
    country,
    cloudflareDataCenter: request.cf?.colo ?? null,
    mirror,
    mirrorKeySet: typeof env.CN_MIRROR_KEY === "string" && env.CN_MIRROR_KEY.length >= 16,
    viaMirror: fromMirror(request, env),
    pageLoadsRedirect: Boolean(mirror) && country === "CN",
  };
}
