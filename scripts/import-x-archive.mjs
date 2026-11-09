// Free alternative to the X API: import posts from your X data export.
// X → Settings → Your account → Download an archive of your data.
// Unzip it, then:
//   node scripts/import-x-archive.mjs path/to/archive/data/tweets.js yourhandle

import { readFileSync } from "node:fs";
import { tweetToMarkdown, writeNote } from "./notes-lib.mjs";

const [file, username] = process.argv.slice(2);
if (!file || !username) {
  console.error("Usage: node scripts/import-x-archive.mjs <data/tweets.js> <yourhandle>");
  process.exit(1);
}

const raw = readFileSync(file, "utf8");
const items = JSON.parse(raw.slice(raw.indexOf("[")));

let created = 0;
let skipped = 0;
for (const { tweet: t } of items) {
  const isReply = Boolean(t.in_reply_to_status_id_str);
  const isRetweet = t.full_text.startsWith("RT @");
  if (isReply || isRetweet) {
    skipped++;
    continue;
  }
  const isNew = writeNote({
    id: t.id_str,
    date: t.created_at,
    url: `https://x.com/${username}/status/${t.id_str}`,
    body: tweetToMarkdown(t.full_text, t.entities?.urls),
  });
  if (isNew) created++;
}
console.log(`Imported ${created} post(s); skipped ${skipped} replies and reposts.`);
