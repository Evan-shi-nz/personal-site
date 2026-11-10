import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { site } from "./src/site.config.ts";
import externalLinks from "./src/lib/external-links.mjs";

// Static pages; the API routes and the X sync cron run in the Worker (worker/index.js).
export default defineConfig({
  // Keep CSS working on older iPhones (Safari 15+): the minifier then keeps -webkit- prefixes
  vite: { build: { cssTarget: ["safari15", "chrome100", "firefox100"] } },
  site: site.url,
  trailingSlash: "never",
  build: { format: "file" },
  // Load a page in the background when the pointer rests on a link to it, so clicking feels instant
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  // Links to other websites (X, GitHub, links inside posts and notes) open in a new tab
  integrations: [
    // Sample posts and notes (file names starting with "sample-") stay out of the sitemap
    // and so do notes while the Notes section is switched off
    sitemap({ filter: (page) => !/\/sample-/.test(page) && (site.notesEnabled || !/\/notes(\/|$)/.test(page)) }),
    externalLinks({ site: site.url }),
  ],
});
