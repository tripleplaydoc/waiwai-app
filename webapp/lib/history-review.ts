/** Year review: group a year's history rows by payee and direction so each can be checked once. Pure, no database. */

export interface ReviewRow { id: string; date: string; amountCents: number; payee: string; memo: string; account: string; kind: string; typeKey: string | null }
export type ReviewDir = "in" | "out";
export interface ReviewGroup {
  key: string; payee: string; dir: ReviewDir; count: number; totalCents: number;
  /** One value when every row agrees: "TRANSFER", a type key, or "" (no type yet). null = rows disagree. */
  current: string | null;
  hasTransfer: boolean; needsType: number; rows: ReviewRow[];
}
export type ReviewFilter = "all" | "in" | "out" | "transfer" | "todo";

/** What a row is classified as right now. */
export const currentOf = (r: { kind: string; typeKey: string | null }): string => (r.kind === "TRANSFER" ? "TRANSFER" : r.typeKey ?? "");
export const dirOf = (amountCents: number): ReviewDir => (amountCents < 0 ? "out" : "in");

export function groupForReview(rows: ReviewRow[]): ReviewGroup[] {
  const map = new Map<string, ReviewGroup>();
  for (const r of rows) {
    const dir = dirOf(r.amountCents), key = `${dir}|${r.payee}`;
    let g = map.get(key);
    if (!g) { g = { key, payee: r.payee, dir, count: 0, totalCents: 0, current: currentOf(r), hasTransfer: false, needsType: 0, rows: [] }; map.set(key, g); }
    const c = currentOf(r);
    if (g.current !== null && g.current !== c) g.current = null;
    g.count += 1; g.totalCents += r.amountCents; g.rows.push(r);
    if (c === "TRANSFER") g.hasTransfer = true;
    if (c === "") g.needsType += 1;
  }
  return [...map.values()].sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents) || a.payee.localeCompare(b.payee));
}

export function filterGroups(groups: ReviewGroup[], f: ReviewFilter, q: string): ReviewGroup[] {
  const needle = q.trim().toLowerCase();
  return groups.filter((g) => {
    if (needle && !(g.payee.toLowerCase().includes(needle) || g.rows.some((r) => r.memo.toLowerCase().includes(needle)))) return false;
    if (f === "in") return g.dir === "in" && g.current !== "TRANSFER";
    if (f === "out") return g.dir === "out" && g.current !== "TRANSFER";
    if (f === "transfer") return g.hasTransfer;
    if (f === "todo") return g.needsType > 0;
    return true;
  });
}

export interface ReviewTotals { incomeCents: number; expenseCents: number; transferCents: number; transferCount: number; needsType: number; rows: number }
/** What the year adds up to as classified now (transfers kept out of income and expenses). */
export function reviewTotals(rows: { amountCents: number; kind: string; typeKey: string | null }[]): ReviewTotals {
  const t: ReviewTotals = { incomeCents: 0, expenseCents: 0, transferCents: 0, transferCount: 0, needsType: 0, rows: rows.length };
  for (const r of rows) {
    if (r.kind === "TRANSFER") { t.transferCents += Math.abs(r.amountCents); t.transferCount += 1; continue; }
    if (r.typeKey === null) t.needsType += 1;
    if (r.kind === "INCOME") t.incomeCents += r.amountCents; else t.expenseCents += Math.abs(r.amountCents);
  }
  return t;
}
