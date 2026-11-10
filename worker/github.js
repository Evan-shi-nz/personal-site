// GET /api/github: public GitHub contribution calendar (the green squares) for the site owner.
// Reads github.com/users/<name>/contributions, the same public page GitHub's profile uses.
// No token needed. Cached for 12 hours.

const CACHE_SECONDS = 12 * 60 * 60;

// Parses GitHub's contribution calendar HTML into [{ date, level, count }] and the yearly total.
export function parseContributions(html) {
  const counts = new Map();
  for (const m of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>\s*([^<]*)<\/tool-tip>/g)) {
    const n = m[2].match(/^(\d[\d,]*)\s+contribution/);
    counts.set(m[1], n ? Number(n[1].replace(/,/g, "")) : 0);
  }
  const days = [];
  for (const m of html.matchAll(/<td\b[^>]*\bdata-date="[^"]+"[^>]*>/g)) {
    const tag = m[0];
    const date = tag.match(/\bdata-date="(\d{4}-\d{2}-\d{2})"/)?.[1];
    const level = Number(tag.match(/\bdata-level="(\d)"/)?.[1] ?? 0);
    const id = tag.match(/\bid="([^"]+)"/)?.[1];
    if (date) days.push({ date, level, count: counts.get(id) ?? (level > 0 ? null : 0) });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  const totalText = html.match(/([\d,]+)\s+contributions?\s+in the last year/);
  const total = totalText ? Number(totalText[1].replace(/,/g, "")) : days.reduce((a, d) => a + (d.count ?? 0), 0);
  return { total, days };
}

export async function github(request, env, ctx) {
  const user = (env.GITHUB_REPO || "").split("/")[0];
  if (!user) return Response.json({ error: "GITHUB_REPO is not set" }, { status: 500 });

  const cache = caches.default;
  const cacheKey = new Request(new URL(`/api/github?u=${user}`, request.url).href);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const res = await fetch(`https://github.com/users/${encodeURIComponent(user)}/contributions`, {
    headers: { "User-Agent": "personal-site (contribution calendar)", Accept: "text/html" },
  });
  if (!res.ok) return Response.json({ error: `GitHub responded ${res.status}` }, { status: 502 });
  const data = { user, url: `https://github.com/${user}`, ...parseContributions(await res.text()) };
  if (data.days.length === 0) return Response.json({ error: "Could not read the contribution calendar" }, { status: 502 });

  const out = Response.json(data, { headers: { "Cache-Control": `public, max-age=${CACHE_SECONDS}` } });
  ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}
