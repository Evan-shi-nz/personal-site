import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// Blog posts: src/content/blog/<slug>.md
// The file name is the URL, so name files with readable English words:
// ielts-writing-task-2-plan.md -> /blog/ielts-writing-task-2-plan
const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

// Short notes, including posts synced from X: src/content/notes/<id>.md
const notes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/notes" }),
  schema: z.object({
    date: z.coerce.date(),
    source: z.enum(["x", "site"]).default("site"),
    url: z.string().url().optional(),
  }),
});

export const collections = { blog, notes };
