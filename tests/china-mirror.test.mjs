import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
import { clientIp } from "../worker/china-mirror.js";

const ctx = { waitUntil() {} };
const KEY = "k".repeat(32);
const env = (extra = {}) => ({ ASSETS: { fetch: async () => new Response("static page") }, CN_MIRROR: "https://cn.evanshi.nz", CN_MIRROR_KEY: KEY, ...extra });
// Cloudflare adds request.cf with the visitor's country; plain Requests in Node have none.
function req(url, { country, accept = "text/html,application/xhtml+xml", ua = "Mozilla/5.0 (iPhone)", headers = {}, method = "GET" } = {}) {
  const r = new Request(url, { method, headers: { Accept: accept, "User-Agent": ua, ...headers } });
  Object.defineProperty(r, "cf", { value: country ? { country } : undefined });
  return r;
}

test("a page load from mainland China goes to the mirror, keeping the path and query", async () => {
  const res = await worker.fetch(req("https://evanshi.nz/blog/post?x=1", { country: "CN" }), env(), ctx);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), "https://cn.evanshi.nz/blog/post?x=1");
});

test("the mirror address may include a port", async () => {
  const res = await worker.fetch(req("https://evanshi.nz/cv", { country: "CN" }), env({ CN_MIRROR: "https://cn.evanshi.nz:8443" }), ctx);
  assert.equal(res.headers.get("Location"), "https://cn.evanshi.nz:8443/cv");
});

test("no redirect elsewhere, when switched off, for the API, files, bots or the mirror itself", async () => {
  const cases = [
    [req("https://evanshi.nz/", { country: "NZ" }), env()],
    [req("https://evanshi.nz/", { country: "HK" }), env()],
    [req("https://evanshi.nz/", { country: "CN" }), env({ CN_MIRROR: "" })],
    [req("https://evanshi.nz/api/revenue/projects", { country: "CN" }), env()],
    [req("https://evanshi.nz/images/avatar.webp", { country: "CN", accept: "image/webp,*/*" }), env()],
    [req("https://evanshi.nz/", { country: "CN", ua: "Mozilla/5.0 (compatible; Baiduspider/2.0)" }), env()],
    [req("https://evanshi.nz/", { country: "CN", headers: { "X-Mirror-Key": KEY } }), env()],
    [req("https://evanshi.nz/", { country: "CN", method: "POST" }), env()],
  ];
  for (const [r, e] of cases) {
    const res = await worker.fetch(r, e, ctx);
    assert.notEqual(res.status, 302, r.url);
  }
});

test("the visitor's real IP is trusted only with the right key", () => {
  const h = (headers) => new Request("https://evanshi.nz/api/guestbook", { headers: { "CF-Connecting-IP": "203.0.113.9", "X-Mirror-Client-IP": "198.51.100.7", ...headers } });
  assert.equal(clientIp(h({ "X-Mirror-Key": KEY }), env()), "198.51.100.7");
  assert.equal(clientIp(h({ "X-Mirror-Key": "wrong-key-wrong-key" }), env()), "203.0.113.9");
  assert.equal(clientIp(h({}), env()), "203.0.113.9");
  assert.equal(clientIp(h({ "X-Mirror-Key": "" }), env({ CN_MIRROR_KEY: "" })), "203.0.113.9");
});

test("/api/region reports the country and whether pages redirect", async () => {
  const res = await worker.fetch(req("https://evanshi.nz/api/region", { country: "CN", accept: "*/*" }), env(), ctx);
  const body = await res.json();
  assert.equal(body.country, "CN");
  
  assert.equal(body.mirrorKeySet, true);
  assert.equal(JSON.stringify(body).includes(KEY), false);
});

test("a cn-test cookie pretends to be in China, for testing from anywhere", async () => {
  const res = await worker.fetch(req("https://evanshi.nz/cv", { country: "US", headers: { Cookie: "a=b; cn-test=1" } }), env(), ctx);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), "https://cn.evanshi.nz/cv");
});
