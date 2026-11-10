# Notes for Claude

- Always reply to the user (Evan) in Simplified Chinese unless they ask for another language.
  Code, commit messages and website copy stay in English.
- The site is deployed by Cloudflare Workers Builds on every push to `main`; see README.md.
- Sample posts and notes are files named `sample-*.md` in `src/content/`; remove them with
  `rm src/content/*/sample-*.md` when the user asks.
