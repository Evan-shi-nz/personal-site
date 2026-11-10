import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

const env = { ASSETS: { fetch: async () => new Response("static page") } };
const ctx = { waitUntil() {} };

test("www sends visitors to the bare domain, keeping the path and query", async () => {
  const res = await worker.fetch(new Request("https://www.evanshi.nz/blog/some-post?x=1"), env, ctx);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("Location"), "https://evanshi.nz/blog/some-post?x=1");
});

test("the bare domain and workers.dev serve pages normally", async () => {
  for (const u of ["https://evanshi.nz/blog", "https://personal-site.ssgooglx.workers.dev/cv"]) {
    const res = await worker.fetch(new Request(u), env, ctx);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "static page");
  }
});
