import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { site } from "../site.config";
import { getPosts } from "../lib/content";

export async function GET(context: APIContext) {
  const posts = await getPosts();
  return rss({
    title: `${site.name}'s blog`,
    description: site.description,
    site: context.site!,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      link: `/blog/${p.id}`,
    })),
  });
}
