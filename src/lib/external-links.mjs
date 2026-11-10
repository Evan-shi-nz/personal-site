// Astro integration: after the build, every link to another website opens in a new tab.
// Runs on the generated HTML, so it covers blog posts, notes synced from X and every page,
// whatever produced the link. Links to this site and mailto: links are left alone.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function addNewTabToExternalLinks(html, ownHost) {
  return html.replace(/<a\b([^>]*?)>/gi, (tag, attrs) => {
    const href = attrs.match(/\shref="(https?:\/\/[^"]+)"/i)?.[1];
    if (!href || /\starget=/i.test(attrs)) return tag;
    let host;
    try {
      host = new URL(href.replace(/&amp;/g, "&")).host;
    } catch {
      return tag;
    }
    if (host === ownHost) return tag;
    const rel = attrs.match(/\srel="([^"]*)"/i);
    const relValue = [...new Set([...(rel?.[1].split(/\s+/).filter(Boolean) ?? []), "noopener", "noreferrer"])].join(" ");
    const rest = rel ? attrs.replace(rel[0], "") : attrs;
    return `<a${rest} target="_blank" rel="${relValue}">`;
  });
}

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

export default function externalLinks({ site }) {
  const ownHost = new URL(site).host;
  return {
    name: "external-links-new-tab",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const files = await htmlFiles(fileURLToPath(dir));
        let changed = 0;
        for (const f of files) {
          const html = await readFile(f, "utf8");
          const next = addNewTabToExternalLinks(html, ownHost);
          if (next !== html) {
            await writeFile(f, next);
            changed++;
          }
        }
        logger.info(`External links open in a new tab (${changed} pages updated).`);
      },
    },
  };
}
