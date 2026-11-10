import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { site } from "./src/site.config.ts";
import externalLinks from "./src/lib/external-links.mjs";

// Static pages; the API routes and the X sync cron run in the Worker (worker/index.js).
export default defineConfig({
  site: site.url,
  trailingSlash: "never",
  build: { format: "file" },
  // Links to other websites (X, GitHub, links inside posts and notes) open in a new tab
  integrations: [
    // Sample posts and notes (file names starting with "sample-") stay out of the sitemap
    // and so do notes while the Notes section is switched off
    sitemap({ filter: (page) => !/\/sample-/.test(page) && (site.notesEnabled || !/\/notes(\/|$)/.test(page)) }),
    externalLinks({ site: site.url }),
  ],
});
