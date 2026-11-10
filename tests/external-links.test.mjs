import { test } from "node:test";
import assert from "node:assert/strict";
import { addNewTabToExternalLinks as fix } from "../src/lib/external-links.mjs";

const own = "personal-site.ssgooglx.workers.dev";

test("external links open in a new tab", () => {
  assert.equal(fix('<a href="https://x.com/a/status/1">X</a>', own), '<a href="https://x.com/a/status/1" target="_blank" rel="noopener noreferrer">X</a>');
});
test("keeps existing rel values such as rel=me", () => {
  assert.equal(fix('<a href="https://github.com/x" rel="me">G</a>', own), '<a href="https://github.com/x" target="_blank" rel="me noopener noreferrer">G</a>');
});
test("leaves internal, relative, mailto and already-targeted links alone", () => {
  for (const html of [
    `<a href="https://${own}/blog">b</a>`,
    '<a href="/notes">n</a>',
    '<a href="mailto:a@b.co">m</a>',
    '<a href="https://x.com" target="_self">x</a>',
    '<a class="home" href="/">h</a>',
  ]) assert.equal(fix(html, own), html);
});
