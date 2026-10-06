/** Matching the Category column of a bank export to this workspace's pockets. Pure. */
export interface PocketRef { id: string; name: string; group: string }

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
/** Names that mean "no real category" or "not an expense": never matched automatically. */
const SKIP = new Set(["", "uncategorized", "uncategorised", "revenue", "income", "refund", "equity", "banktransfer", "transfer", "creditcardpayment", "incometaxpaid"]);

export function isUsableCategory(name: string): boolean {
  return !SKIP.has(norm(name));
}

/**
 * The pocket a bank category most likely means: same name, ignoring case, "&" vs "and" and punctuation; else a single pocket whose name
 * contains it or is contained by it. Anything unclear returns null so the app never guesses between two pockets.
 */
export function matchCategoryName(name: string, pockets: PocketRef[]): string | null {
  const n = norm(name);
  if (!isUsableCategory(name)) return null;
  const exact = pockets.filter((p) => norm(p.name) === n);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;
  if (n.length < 4) return null;
  const near = pockets.filter((p) => { const k = norm(p.name); return k.length >= 4 && (k.includes(n) || n.includes(k)); });
  return near.length === 1 ? near[0].id : null;
}

/** Distinct bank categories on money-out rows, most used first. */
export function distinctCategories(rows: { category?: string; amountCents: number }[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const c = (r.category ?? "").trim();
    if (r.amountCents >= 0 || !isUsableCategory(c)) continue;
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
