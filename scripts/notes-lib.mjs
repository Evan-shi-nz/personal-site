import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const NOTES_DIR = new URL("../src/content/notes/", import.meta.url).pathname;

// Replace t.co links with the real URLs and make the text safe as Markdown.
export function tweetToMarkdown(text, urls = []) {
  let out = text;
  for (const u of urls) {
    if (u.url && u.expanded_url) out = out.replaceAll(u.url, u.expanded_url);
  }
  out = out
    .replace(/https:\/\/t\.co\/\w+$/, "") // trailing media link
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
  // Stop lines starting with #, -, * or 1. from turning into headings or lists.
  return out
    .split("\n")
    .map((line) => line.replace(/^(\s*)([#>*+-]|\d+\.)(\s)/, "$1\\$2$3"))
    .join("\n\n");
}

// Writes src/content/notes/x-<id>.md once. Returns true if a new file was created.
export function writeNote({ id, date, url, body }) {
  mkdirSync(NOTES_DIR, { recursive: true });
  const file = join(NOTES_DIR, `x-${id}.md`);
  if (existsSync(file)) return false;
  const front = `---\ndate: ${new Date(date).toISOString()}\nsource: x\nurl: ${url}\n---\n\n`;
  writeFileSync(file, front + body + "\n");
  return true;
}
