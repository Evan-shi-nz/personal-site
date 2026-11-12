// Everything personal lives here and in src/data/resume.json.

export const site = {
  // Used for SEO, the sitemap and RSS. The Worker also answers on personal-site.ssgooglx.workers.dev.
  url: "https://evanshi.nz",
  name: "Evan Shi",
  // Browser tab and link-preview title of the home page
  title: "Evan Shi · Senior software engineer",
  // One line under your name on the home page
  tagline: "Senior software engineer with 6+ years in banking and telecom. Building my own AI products, and looking for a role in New Zealand.",
  // Used in <meta name="description"> and search results
  description:
    "Evan Shi: senior software engineer (6+ years in banking and telecom) and indie maker, looking for a software engineering role in New Zealand. CV, verified product revenue and blog.",
  locale: "en_NZ",
  avatar: "/images/avatar.webp",
  // Square image for link previews on X, LinkedIn, etc.
  ogImage: "/images/avatar-og.jpg",
  links: {
    // Set any of these to "" to hide it
    x: "https://x.com/EvanShi_nz",
    // Temporary: LinkedIn home page until the profile exists, then use https://www.linkedin.com/in/<name>
    linkedin: "https://www.linkedin.com/",
    github: "https://github.com/Evan-shi-nz",
    email: "nz.evanshi@gmail.com",
    // WhatsApp contact link from the app's QR code; the QR image is public/images/whatsapp-qr.png.
    // Anyone who opens it can start a chat (and see the phone number). Set to "" to hide.
    whatsapp: "https://wa.me/qr/BRPCDDFHIZABA1",
  },
  // X username without @, used to link notes back to their original posts
  xUsername: "EvanShi_nz",
  // Public GitHub repos people can inspect
  repos: {
    site: "https://github.com/Evan-shi-nz/personal-site",
    verifier: "https://github.com/Evan-shi-nz/stripe-revenue-verifier",
  },
  // One quiet line under the contacts on the home page. Set enabled: false to hide.
  openToWork: {
    enabled: true,
    text: "Open to full-time roles in New Zealand. I'll need a work visa. Always happy to chat.",
  },
  // Shown on the home page; keep it short and current
  now: [
    "Looking for a software engineering role in New Zealand",
    "Preparing for the IELTS Academic test",
    "Running two small AI products on my own",
  ],
  // Revenue page: everything is shown in this currency. Rates are units per 1 USD;
  // the HKD rate is the Hong Kong dollar peg. Add a rate if a project earns in another currency.
  revenue: { currency: "usd", rates: { usd: 1, hkd: 7.8 } as Record<string, number> },
  // Home page sections that can be switched off
  home: { github: false }, // turn on once the GitHub account has some activity
  // The Notes section (short updates, can sync from X). Off for now: hidden from the menu,
  // the home page and search engines. The X sync code stays ready; see README.
  notesEnabled: false,
  // Optional one-line description per product on the Products page, keyed by the project's
  // position in STRIPE_REVENUE_KEYS ("1" = first line). Leave "" to show nothing.
  // Describe what it does and what you built, without naming it, e.g.
  // "AI speech-to-text tool for creators. I built the transcription pipeline, payments and hosting."
  productNotes: {
    "1": "Audio and video transcription tool, launched in 2026. I built the speech-to-text pipeline, the web app and billing.",
    "2": "AI image editing tool for creators and small businesses, paid with credit packs and subscriptions. I built and run all of it on my own: AI pipeline, web app, payments and hosting.",
  } as Record<string, string>,
  // Items per page
  pageSize: { blog: 10, notes: 20 },
};
