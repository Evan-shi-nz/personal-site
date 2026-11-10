// Free way to bring in older posts: import them from your X data export.
// X → Settings → Your account → Download an archive of your data. Unzip it, then:
//   node scripts/import-x-archive.mjs path/to/archive/data/tweets.js EvanShi_nz
// Posts already in src/content/notes (same tweetId) are skipped, so it is safe to run again.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NOTES_DIR, noteFile, slugify, tweetToMarkdown, uniqueSlug } from "../lib/notes.mjs";

const [file, username] = process.argv.slice(2);
if (!file || !username) {
  console.error("Usage: node scripts/import-x-archive.mjs <data/tweets.js> <x-username>");
  process.exit(1);
}

const root = new URL("..", import.meta.url).pathname;
const dir = join(root, NOTES_DIR);
mkdirSync(dir, { recursive: true });

const taken = new Set();
const known = new Set();
for (const name of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
  taken.add(name.replace(/\.md$/, ""));
  const id = readFileSync(join(dir, name), "utf8").match(/^tweetId:\s*"?(\d+)"?/m)?.[1];
  if (id) known.add(id);
}

const raw = readFileSync(file, "utf8");
const items = JSON.parse(raw.slice(raw.indexOf("[")));
const tweets = items
  .map((i) => i.tweet)
  .filter((t) => !t.in_reply_to_status_id_str && !t.full_text.startsWith("RT @"))
  .sort((a, b) => (BigInt(a.id_str) < BigInt(b.id_str) ? -1 : 1));

let created = 0;
for (const t of tweets) {
  if (known.has(t.id_str)) continue;
  const slug = uniqueSlug(slugify(t.full_text), t.created_at, taken);
  taken.add(slug);
  const f = noteFile({
    slug,
    tweetId: t.id_str,
    date: t.created_at,
    url: `https://x.com/${username}/status/${t.id_str}`,
    body: tweetToMarkdown(t.full_text, t.entities?.urls),
  });
  const path = join(root, f.path);
  if (!existsSync(path)) {
    writeFileSync(path, f.content);
    created++;
  }
}
console.log(`Imported ${created} post(s). Skipped ${items.length - tweets.length} replies and reposts, and posts already imported.`);
