import { getCollection, type CollectionEntry } from "astro:content";

export async function getPosts() {
  const posts = await getCollection("blog", ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getNotes() {
  const notes = await getCollection("notes");
  return notes.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

// Plain text of a note, for titles and meta descriptions.
export function noteText(note: CollectionEntry<"notes">) {
  return (note.body ?? "")
    .replace(/\\([#>*+-])/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(text: string, max: number) {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, max - 1).join("").trimEnd() + "…";
}

export function noteTitle(note: CollectionEntry<"notes">) {
  return truncate(noteText(note), 70) || "Note";
}

// Splits a list into pages. Page 1 lives at `base`, page n at `${base}/page/n`.
export function paginate<T>(items: T[], size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  return Array.from({ length: pages }, (_, i) => ({
    page: i + 1,
    pages,
    items: items.slice(i * size, (i + 1) * size),
  }));
}

export const pageHref = (base: string, page: number) => (page <= 1 ? base : `${base}/page/${page}`);

export function formatDate(d: Date) {
  return d.toLocaleDateString("en-NZ", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
