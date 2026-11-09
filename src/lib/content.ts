import { getCollection } from "astro:content";

export async function getPosts() {
  const posts = await getCollection("blog", ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getNotes() {
  const notes = await getCollection("notes");
  return notes.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function formatDate(d: Date) {
  return d.toLocaleDateString("en-NZ", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
