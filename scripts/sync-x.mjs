// Copies your latest original posts from X into src/content/notes.
// Runs in GitHub Actions (see .github/workflows/sync-x.yml); can also run locally:
//   X_BEARER_TOKEN=... X_USERNAME=yourhandle node scripts/sync-x.mjs
//
// Needs an X API bearer token with read access. Reading posts is a paid X API feature;
// check current pricing at developer.x.com before enabling the workflow.

import { tweetToMarkdown, writeNote } from "./notes-lib.mjs";

const token = process.env.X_BEARER_TOKEN;
const username = process.env.X_USERNAME;
if (!token || !username) {
  console.log("X_BEARER_TOKEN or X_USERNAME not set; skipping X sync.");
  process.exit(0);
}

const api = async (path) => {
  const res = await fetch(`https://api.x.com/2${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`X API ${res.status}: ${await res.text()}`);
  return res.json();
};

const user = await api(`/users/by/username/${encodeURIComponent(username)}`);
const userId = user.data.id;
const timeline = await api(
  `/users/${userId}/tweets?max_results=20&exclude=replies,retweets&tweet.fields=created_at,entities,note_tweet`,
);

let created = 0;
for (const t of timeline.data ?? []) {
  const text = t.note_tweet?.text ?? t.text; // note_tweet holds the full text of long posts
  const urls = t.note_tweet?.entities?.urls ?? t.entities?.urls ?? [];
  const isNew = writeNote({
    id: t.id,
    date: t.created_at,
    url: `https://x.com/${username}/status/${t.id}`,
    body: tweetToMarkdown(text, urls),
  });
  if (isNew) created++;
}
console.log(`Synced from X: ${created} new note(s).`);
