import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { site } from "./src/site.config.ts";

// Static output only: Cloudflare Pages serves the files, and the one dynamic
// endpoint (/api/revenue) lives in /functions as a Pages Function.
export default defineConfig({
  site: site.url,
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [sitemap()],
});
