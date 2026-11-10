// Shared by the Cloudflare cron sync (worker/x-sync.js) and the X archive importer
// (scripts/import-x-archive.mjs). Turns an X post into a Markdown note whose URL
// comes from its words, e.g. /notes/ielts-writing-task-2-first-attempt.

export const NOTES_DIR = "src/content/notes";

// Replace t.co links with the real URLs and make the text safe as Markdown.
export function tweetToMarkdown(text, urls = []) {
  let out = text;
  for (const u of urls) {
    if (u.url && u.expanded_url) out = out.replaceAll(u.url, u.expanded_url);
  }
  out = out
    .replace(/\s*https:\/\/t\.co\/\w+\s*$/, "") // trailing media link
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
  // Stop lines starting with #, >, -, * or "1." from turning into headings, quotes or lists.
  return out
    .split("\n")
    .map((line) => line.replace(/^(\s*)([#>*+-]|\d+\.)(\s)/, "$1\\$2$3"))
    .join("\n\n");
}

const STOP = new Set(["a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "is", "are", "was", "it", "my", "i", "im", "i'm"]);

// Readable URL slug from the post's own words. Works for English and Chinese:
//   "Day 1 of IELTS prep: writing task 2 is hard" -> "day-1-ielts-prep-writing-task-2-hard"
//   "今天开始备考雅思，写作好难"                   -> "今天开始备考雅思-写作好难"
export function slugify(text, maxLength = 60) {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@\w+/g, " ")
    .replace(/#/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  // A long run of CJK characters counts as one "word": keep at most 24 characters of it.
  const words = cleaned.split(/\s+/).filter(Boolean).map((w) => [...w].slice(0, 24).join(""));
  const meaningful = words.filter((w) => !STOP.has(w));
  const source = meaningful.length >= 2 ? meaningful : words;

  let slug = "";
  for (const w of source) {
    const next = slug ? `${slug}-${w}` : w;
    if ([...next].length <= maxLength) {
      slug = next;
      continue;
    }
    break;
  }
  return slug || "note";
}

// Picks a slug that isn't taken yet: "<slug>", then "<slug>-<yyyy-mm-dd>", then "-2", "-3"...
export function uniqueSlug(base, date, taken) {
  if (!taken.has(base)) return base;
  const dated = `${base}-${new Date(date).toISOString().slice(0, 10)}`;
  if (!taken.has(dated)) return dated;
  for (let i = 2; ; i++) if (!taken.has(`${dated}-${i}`)) return `${dated}-${i}`;
}

// Markdown file for one X post.
export function noteFile({ slug, tweetId, date, url, body }) {
  const yaml = (s) => JSON.stringify(s); // JSON strings are valid YAML scalars
  return {
    path: `${NOTES_DIR}/${slug}.md`,
    content: `---\nslug: ${yaml(slug)}\ndate: ${new Date(date).toISOString()}\nsource: x\ntweetId: ${yaml(tweetId)}\nurl: ${yaml(url)}\n---\n\n${body}\n`,
  };
}
