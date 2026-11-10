// Everything personal lives here and in src/data/resume.json.

export const site = {
  // TODO: replace with your own domain later (used for SEO, sitemap and RSS)
  url: "https://personal-site.ssgooglx.workers.dev",
  name: "Evan Shi",
  // One line under your name on the home page
  tagline: "Software developer and indie maker, on my way from China to New Zealand.",
  // Used in <meta name="description"> and search results
  description:
    "Evan Shi: indie maker moving from China to New Zealand. IELTS preparation, building online products, verified revenue and resume.",
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
  },
  // X username without @, used to link notes back to their original posts
  xUsername: "EvanShi_nz",
  // Public GitHub repos people can inspect
  repos: {
    site: "https://github.com/Evan-shi-nz/personal-site",
    verifier: "https://github.com/Evan-shi-nz/stripe-revenue-verifier",
  },
  // Shown on the home page; keep it short and current
  now: [
    "Preparing for the IELTS Academic test",
    "Running two small online products on my own",
    "Planning my move to New Zealand",
  ],
  // Revenue page: everything is shown in this currency. Rates are units per 1 USD;
  // the HKD rate is the Hong Kong dollar peg. Add a rate if a project earns in another currency.
  revenue: { currency: "usd", rates: { usd: 1, hkd: 7.8 } as Record<string, number> },
  // Home page sections that can be switched off
  home: { github: false }, // turn on once the GitHub account has some activity
  // Items per page
  pageSize: { blog: 10, notes: 20 },
};
