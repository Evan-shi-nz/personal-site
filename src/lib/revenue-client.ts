// Browser-side helpers shared by the revenue page and the home page card.
// Loads every project from /api/revenue, converts all currencies to one display currency,
// and slices the data into time ranges (7/30/60/90 days, 12 months).

type Bucket = { gross: number };
type ApiData = {
  generatedAt?: string;
  complete?: boolean;
  currencies?: Record<string, { total: Bucket; months: Record<string, Bucket>; days: Record<string, Bucket> }>;
  error?: string;
};
type ApiProject = { id: string; label: string; trustmrr?: string | null };

export type Project = {
  id: string;
  label: string;
  trustmrr?: string | null;
  days: Record<string, number>; // YYYY-MM-DD -> cents in display currency
  months: Record<string, number>; // YYYY-MM -> cents
  generatedAt?: string;
  complete: boolean;
  error?: string;
  unconverted: string[]; // currencies with revenue but no exchange rate
};

export type RangeKey = "7d" | "30d" | "60d" | "90d" | "12m";
export const RANGES: { key: RangeKey; label: string; long: string }[] = [
  { key: "7d", label: "7D", long: "last 7 days" },
  { key: "30d", label: "30D", long: "last 30 days" },
  { key: "60d", label: "60D", long: "last 60 days" },
  { key: "90d", label: "90D", long: "last 90 days" },
  { key: "12m", label: "12M", long: "last 12 months" },
];

const zeroDecimal = new Set(["jpy", "krw", "vnd", "clp", "pyg", "ugx", "xaf", "xof"]);

export function makeConverter(currency: string, rates: Record<string, number>) {
  return (minor: number, cur: string): number | null => {
    const rate = rates[cur];
    if (!rate) return null;
    const major = zeroDecimal.has(cur) ? minor : minor / 100;
    return Math.round((major / rate) * (rates[currency] ?? 1) * 100);
  };
}

export function toProject(p: ApiProject, d: ApiData, convert: ReturnType<typeof makeConverter>): Project {
  const out: Project = { id: p.id, label: p.label, trustmrr: p.trustmrr, days: {}, months: {}, generatedAt: d.generatedAt, complete: d.complete !== false, unconverted: [] };
  if (d.error) return { ...out, error: d.error };
  for (const [cur, c] of Object.entries(d.currencies ?? {})) {
    if (c.total.gross <= 0) continue; // fee-only currency
    if (convert(1, cur) === null) {
      out.unconverted.push(cur.toUpperCase());
      continue;
    }
    for (const [k, b] of Object.entries(c.days ?? {})) out.days[k] = (out.days[k] ?? 0) + convert(b.gross, cur)!;
    for (const [k, b] of Object.entries(c.months ?? {})) out.months[k] = (out.months[k] ?? 0) + convert(b.gross, cur)!;
  }
  return out;
}

export async function loadProjects(currency: string, rates: Record<string, number>): Promise<Project[]> {
  const convert = makeConverter(currency, rates);
  const { projects = [] }: { projects?: ApiProject[] } = await fetch("/api/revenue/projects").then((r) => r.json());
  return Promise.all(
    projects.map(async (p) => {
      try {
        const res = await fetch(`/api/revenue?project=${encodeURIComponent(p.id)}`);
        const d: ApiData = await res.json();
        return toProject(p, res.ok ? d : { ...d, error: d.error || `HTTP ${res.status}` }, convert);
      } catch (err) {
        return toProject(p, { error: String((err as Error).message) }, convert);
      }
    }),
  );
}

// The buckets (days or months) that make up a range, and those of the period before it.
export function rangeKeys(range: RangeKey, now = new Date()) {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  if (range === "12m") {
    const months = (offset: number) =>
      Array.from({ length: 12 }, (_, i) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset - 11 + i, 1));
        return d.toISOString().slice(0, 7);
      });
    return { unit: "months" as const, current: months(0), previous: months(12) };
  }
  const n = Number.parseInt(range, 10);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = (offset: number) => Array.from({ length: n }, (_, i) => ymd(new Date(today - (offset + n - 1 - i) * 86400000)));
  return { unit: "days" as const, current: days(0), previous: days(n) };
}

export function sumKeys(p: Project, unit: "days" | "months", keys: string[]) {
  const map = unit === "days" ? p.days : p.months;
  return keys.reduce((a, k) => a + (map[k] ?? 0), 0);
}

export function percentChange(now: number, before: number): number | null {
  return before ? ((now - before) / before) * 100 : null;
}

export function formatMoney(cents: number, currency: string, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(cents / 100);
}
