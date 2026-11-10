// node --test tests/  (no network: X and GitHub are faked)
import { test } from "node:test";
import assert from "node:assert/strict";
import { syncX } from "../worker/x-sync.js";

function fakeApis({ state = null, existing = [], tweets = [] } = {}) {
  const calls = [];
  let committed = null;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || "GET";
    calls.push(`${method} ${u.host}${u.pathname}${u.search}`);
    const ok = (body) => new Response(JSON.stringify(body), { status: 200 });
    if (u.host === "api.x.com") {
      if (u.pathname.startsWith("/2/users/by/username/")) return ok({ data: { id: "42" } });
      const since = u.searchParams.get("since_id");
      return ok({ data: tweets.filter((t) => !since || BigInt(t.id) > BigInt(since)) });
    }
    const p = u.pathname.replace("/repos/Evan-shi-nz/personal-site", "");
    if (p === "/contents/src/data/x-sync.json")
      return state ? ok({ content: btoa(JSON.stringify(state)), sha: "s" }) : new Response("{}", { status: 404 });
    if (p === "/contents/src/content/notes") return ok(existing.map((name) => ({ type: "file", name })));
    if (p === "/git/ref/heads/main") return ok({ object: { sha: "head" } });
    if (p === "/git/commits/head") return ok({ sha: "head", tree: { sha: "tree0" } });
    if (p === "/git/trees" && method === "POST") { committed = JSON.parse(init.body); return ok({ sha: "tree1" }); }
    if (p === "/git/commits" && method === "POST") { committed.message = JSON.parse(init.body).message; return ok({ sha: "c1" }); }
    if (p === "/git/refs/heads/main" && method === "PATCH") return ok({});
    return new Response("unexpected " + p, { status: 500 });
  };
  return { calls, get committed() { return committed; } };
}

const env = { X_BEARER_TOKEN: "x", GITHUB_TOKEN: "g", X_USERNAME: "EvanShi_nz", GITHUB_REPO: "Evan-shi-nz/personal-site", GITHUB_BRANCH: "main" };
const quiet = { log: () => {} };

test("skips when tokens are missing", async () => {
  assert.deepEqual(await syncX({ X_USERNAME: "a" }, quiet), { skipped: true });
});

test("commits new posts as notes with slugs from their words", async () => {
  const api = fakeApis({
    existing: ["starting-my-site-today.md", "ielts-day-1.md"],
    tweets: [
      { id: "200", text: "IELTS day 1", created_at: "2026-11-10T01:00:00Z" },
      { id: "100", text: "今天开始备考雅思，写作好难 https://t.co/x", created_at: "2026-11-09T01:00:00Z", entities: { urls: [{ url: "https://t.co/x", expanded_url: "https://example.org" }] } },
    ],
  });
  assert.deepEqual(await syncX(env, quiet), { created: 2 });
  const files = Object.fromEntries(api.committed.tree.map((f) => [f.path, f.content]));
  assert.deepEqual(Object.keys(files), [
    "src/content/notes/今天开始备考雅思-写作好难.md",
    "src/content/notes/ielts-day-1-2026-11-10.md", // "ielts-day-1" was taken
    "src/data/x-sync.json",
  ]);
  assert.match(files["src/content/notes/今天开始备考雅思-写作好难.md"], /url: "https:\/\/x.com\/EvanShi_nz\/status\/100"/);
  assert.match(files["src/content/notes/今天开始备考雅思-写作好难.md"], /https:\/\/example.org/);
  assert.deepEqual(JSON.parse(files["src/data/x-sync.json"]), { userId: "42", sinceId: "200" });
  assert.equal(api.committed.message, "Sync 2 posts from X");
  assert.equal(api.committed.base_tree, "tree0");
});

test("does nothing when there are no new posts", async () => {
  const api = fakeApis({ state: { userId: "42", sinceId: "200" }, tweets: [{ id: "200", text: "old", created_at: "2026-11-10T01:00:00Z" }] });
  assert.deepEqual(await syncX(env, quiet), { created: 0 });
  assert.equal(api.committed, null);
  assert.ok(api.calls.some((c) => c.includes("since_id=200")));
  assert.ok(!api.calls.some((c) => c.includes("/users/by/username/")));
});
