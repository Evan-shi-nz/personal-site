// Minimal Cloudflare D1 stand-in on Node's built-in SQLite, for tests.
import { DatabaseSync } from "node:sqlite";

export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    async all() { return { results: db.prepare(sql).all(...params) }; },
    async first() { return db.prepare(sql).get(...params) ?? null; },
    async run() { db.prepare(sql).run(...params); return { success: true }; },
    _exec() { return /^\s*(SELECT|WITH)|RETURNING/i.test(sql) ? { results: db.prepare(sql).all(...params) } : (db.prepare(sql).run(...params), { results: [] }); },
  });
  return {
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec("BEGIN");
      try { const out = list.map((s) => s._exec()); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
    raw: db,
  };
}
