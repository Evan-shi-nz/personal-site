import { clientIp } from "./china-mirror.js";
// Guestbook API on Cloudflare D1 (binding: DB).
//   GET  /api/guestbook?page=1   public list, newest first (emails are never returned)
//   POST /api/guestbook          { name, email, message, website, t }
// No captcha. Spam is kept down with a hidden honeypot field, a minimum fill time,
// per-visitor rate limits, a link limit and duplicate detection.

const PAGE_SIZE = 20;
const LIMITS = { name: 40, email: 254, message: 1000 };

// Create tables once per database (per Worker instance).
const schemaReady = new WeakMap();
function ensureSchema(db) {
  if (!schemaReady.has(db)) schemaReady.set(db, db
    .batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS guestbook (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        visitor TEXT NOT NULL,
        hidden INTEGER NOT NULL DEFAULT 0
      )`),
      db.prepare(`CREATE INDEX IF NOT EXISTS guestbook_visible ON guestbook (hidden, id DESC)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS guestbook_visitor ON guestbook (visitor, created_at)`),
    ])
    .catch((err) => {
      schemaReady.delete(db);
      throw err;
    }));
  return schemaReady.get(db);
}

export async function guestbook(request, env) {
  if (!env.DB) return json({ error: "The guestbook database is not connected yet." }, 503);
  await ensureSchema(env.DB);
  if (request.method === "GET" || request.method === "HEAD") return list(request, env.DB);
  if (request.method === "POST") return create(request, env.DB, env);
  return json({ error: "Method not allowed" }, 405, { Allow: "GET, POST" });
}

async function list(request, db) {
  const page = Math.max(1, Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10) || 1);
  const [{ results }, count] = await db.batch([
    db
      .prepare(`SELECT id, name, message, created_at FROM guestbook WHERE hidden = 0 ORDER BY id DESC LIMIT ? OFFSET ?`)
      .bind(PAGE_SIZE, (page - 1) * PAGE_SIZE),
    db.prepare(`SELECT COUNT(*) AS n FROM guestbook WHERE hidden = 0`),
  ]);
  const total = count.results[0].n;
  return json({ entries: results, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total }, 200, {
    "Cache-Control": "no-store",
  });
}

async function create(request, db, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send the form as JSON." }, 400);
  }
  const name = clean(body.name);
  const email = clean(body.email).toLowerCase();
  const message = String(body.message ?? "").replace(/\r\n/g, "\n").trim();

  // Bots fill every field, including the hidden one, and submit instantly.
  // Pretend success so they don't learn anything.
  const elapsed = Date.now() - Number(body.t);
  if (body.website || !(elapsed > 3000)) return json({ ok: true }, 201);

  if (!name || [...name].length > LIMITS.name) return json({ error: `Please enter a name (up to ${LIMITS.name} characters).` }, 400);
  if (email.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return json({ error: "Please enter a valid email address." }, 400);
  if ([...message].length < 2 || [...message].length > LIMITS.message)
    return json({ error: `Please write a message (2 to ${LIMITS.message} characters).` }, 400);
  if ((message.match(/https?:\/\/|www\./gi) ?? []).length > 2)
    return json({ error: "Please include at most two links." }, 400);

  const visitor = await hash(`${clientIp(request, env)}|guestbook`);
  const now = new Date();
  const [recent, today, dup] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM guestbook WHERE visitor = ? AND created_at > ?`).bind(visitor, ago(now, 60)),
    db.prepare(`SELECT COUNT(*) AS n FROM guestbook WHERE visitor = ? AND created_at > ?`).bind(visitor, ago(now, 86400)),
    db.prepare(`SELECT COUNT(*) AS n FROM guestbook WHERE message = ? AND created_at > ?`).bind(message, ago(now, 86400)),
  ]);
  if (recent.results[0].n > 0) return json({ error: "You just posted. Please wait a minute before posting again." }, 429);
  if (today.results[0].n >= 10) return json({ error: "You've reached today's limit. Please come back tomorrow." }, 429);
  if (dup.results[0].n > 0) return json({ error: "This message was already posted." }, 409);

  const row = await db
    .prepare(`INSERT INTO guestbook (name, email, message, created_at, visitor) VALUES (?, ?, ?, ?, ?) RETURNING id, name, message, created_at`)
    .bind(name, email, message, now.toISOString(), visitor)
    .first();
  return json({ ok: true, entry: row }, 201);
}

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const ago = (now, seconds) => new Date(now.getTime() - seconds * 1000).toISOString();

async function hash(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
