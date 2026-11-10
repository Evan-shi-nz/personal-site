// Cloudflare Cron Trigger: copy new X posts into the repo as Markdown notes.
// One commit per run; the commit triggers a Workers Build, so the notes appear on /notes
// as static, SEO-friendly pages that link back to the original post.
//
// Needs (Worker → Settings → Variables and Secrets):
//   X_BEARER_TOKEN  secret  X API bearer token with read access
//   GITHUB_TOKEN    secret  fine-grained token, this repo only, Contents: Read and write
// Configured in wrangler.jsonc: X_USERNAME, GITHUB_REPO, GITHUB_BRANCH.

import { NOTES_DIR, noteFile, slugify, tweetToMarkdown, uniqueSlug } from "../lib/notes.mjs";

const STATE_PATH = "src/data/x-sync.json";

export async function syncX(env, { log = console.log } = {}) {
  if (!env.X_BEARER_TOKEN || !env.GITHUB_TOKEN) {
    log("X sync skipped: X_BEARER_TOKEN or GITHUB_TOKEN is not set.");
    return { skipped: true };
  }
  const gh = github(env);
  const x = xApi(env);

  // 1. Where did the last run stop?
  const stateFile = await gh.getFile(STATE_PATH);
  const state = stateFile ? JSON.parse(stateFile.text) : {};
  if (!state.userId) {
    const user = await x(`/users/by/username/${encodeURIComponent(env.X_USERNAME)}`);
    state.userId = user.data.id;
  }

  // 2. New original posts since then (no replies or reposts).
  const params = new URLSearchParams({
    max_results: "20",
    exclude: "replies,retweets",
    "tweet.fields": "created_at,entities,note_tweet",
  });
  if (state.sinceId) params.set("since_id", state.sinceId);
  const timeline = await x(`/users/${state.userId}/tweets?${params}`);
  const tweets = (timeline.data ?? []).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  if (tweets.length === 0) {
    log("X sync: no new posts.");
    return { created: 0 };
  }

  // 3. Turn each post into a note with a slug from its words.
  const taken = new Set((await gh.listDir(NOTES_DIR)).map((name) => name.replace(/\.md$/, "")));
  const files = [];
  for (const t of tweets) {
    const text = t.note_tweet?.text ?? t.text; // note_tweet holds the full text of long posts
    const urls = t.note_tweet?.entities?.urls ?? t.entities?.urls ?? [];
    const slug = uniqueSlug(slugify(text), t.created_at, taken);
    taken.add(slug);
    files.push(
      noteFile({
        slug,
        tweetId: t.id,
        date: t.created_at,
        url: `https://x.com/${env.X_USERNAME}/status/${t.id}`,
        body: tweetToMarkdown(text, urls),
      }),
    );
  }
  state.sinceId = tweets[tweets.length - 1].id;
  files.push({ path: STATE_PATH, content: JSON.stringify(state, null, 2) + "\n" });

  // 4. One commit with all new notes and the updated state.
  await gh.commit(files, `Sync ${tweets.length} post${tweets.length > 1 ? "s" : ""} from X`);
  log(`X sync: committed ${tweets.length} new note(s).`);
  return { created: tweets.length };
}

function xApi(env) {
  return async (path) => {
    const res = await fetch(`https://api.x.com/2${path}`, { headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` } });
    if (!res.ok) throw new Error(`X API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  };
}

function github(env) {
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";
  const call = async (path, init = {}) => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "personal-site-x-sync",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (res.status === 404 && (!init.method || init.method === "GET")) return null;
    if (!res.ok) throw new Error(`GitHub ${init.method || "GET"} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.json();
  };
  const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

  return {
    async getFile(path) {
      const f = await call(`/contents/${path}?ref=${branch}`);
      return f ? { text: b64decode(f.content), sha: f.sha } : null;
    },
    async listDir(path) {
      const list = await call(`/contents/${path}?ref=${branch}`);
      return (list ?? []).filter((e) => e.type === "file").map((e) => e.name);
    },
    async commit(files, message) {
      const ref = await call(`/git/ref/heads/${branch}`);
      const head = await call(`/git/commits/${ref.object.sha}`);
      const tree = await call(`/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          base_tree: head.tree.sha,
          tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
        }),
      });
      const commit = await call(`/git/commits`, {
        method: "POST",
        body: JSON.stringify({ message, tree: tree.sha, parents: [head.sha] }),
      });
      await call(`/git/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
    },
  };
}
