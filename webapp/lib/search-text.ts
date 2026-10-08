/** Plain-text search shared by the History and account pages. Pure, no database. */

const clean = (s: string): string => s.toLowerCase().replace(/[$,]/g, "").replace(/\s+/g, " ").trim();

/** Words in a search box: lowercased, "$" and thousands commas dropped so "$1,200" finds 1200.00. */
export const searchTokens = (q: string): string[] => clean(q).split(" ").filter(Boolean);

/** Dollars written the ways people type them: "84.17" (no sign), so a search for 84 or 84.17 finds -$84.17. */
export const amountText = (cents: number): string => {
  const abs = Math.abs(Math.trunc(cents));
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};

/** Every search word must appear somewhere in the fields (payee, memo, category, amount…). An empty search matches all. */
export function matchesSearch(fields: (string | number | null | undefined)[], q: string): boolean {
  const tokens = searchTokens(q);
  if (tokens.length === 0) return true;
  const hay = clean(fields.filter((f) => f !== null && f !== undefined && f !== "").join(" | "));
  return tokens.every((t) => hay.includes(t));
}
