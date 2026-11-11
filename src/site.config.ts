// Everything personal lives here and in src/data/resume.json.

export const site = {
  // Used for SEO, the sitemap and RSS. The Worker also answers on personal-site.ssgooglx.workers.dev.
  url: "https://evanshi.nz",
  name: "Evan Shi",
  // One line under your name on the home page
  tagline: "Software engineer and indie maker. Preparing for IELTS, then a master's degree and a career in New Zealand.",
  // Used in <meta name="description"> and search results
  description:
    "Evan Shi: software engineer and indie maker on the way from China to New Zealand. IELTS preparation, small AI products, verified revenue and CV.",
  locale: "en_NZ",
  avatar: "/images/avatar.webp",
  // Square image for link previews on X, LinkedIn, etc.
  ogImage: "/images/avatar-og.jpg",
  links: {
    // Set any of these to "" to hide it
    x: "https://x.com/EvanShi_nz",
    linkedin: "",
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
    text: "Open to software engineering roles in New Zealand. Always happy to chat.",
  },
  // Shown on the home page; keep it short and current
  now: [
    "Preparing for the IELTS Academic test",
    "Choosing a master's programme in New Zealand",
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
  // Items per page
  pageSize: { blog: 10, notes: 20 },
};
