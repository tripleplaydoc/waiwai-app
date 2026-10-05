/** Turns a window's income and spending into "where every $100 went". Money is integer cents. */
export interface FlowIn { label: string; cents: number }
export interface FlowSlice { label: string; cents: number; per100Cents: number; kind: "spend" | "tax" | "left" | "over" }

/**
 * Slices ordered largest first. Spending below `minPct` of income folds into "Everything else".
 * Leftover is income minus spending minus taxes paid: "Kept" when positive, "Overspent" when negative.
 * per100Cents is that slice per $100 of income, in cents (so 2,350 means $23.50).
 */
export function flowSlices(incomeCents: number, spending: FlowIn[], taxPaidCents: number, minPct = 3): FlowSlice[] {
  if (incomeCents <= 0) return [];
  const per = (c: number) => Math.round((c * 10000) / incomeCents);
  const spend = spending.filter((s) => s.cents > 0).sort((a, b) => b.cents - a.cents);
  const big: FlowSlice[] = [];
  let small = 0;
  for (const s of spend) {
    if ((s.cents * 100) / incomeCents >= minPct) big.push({ label: s.label, cents: s.cents, per100Cents: per(s.cents), kind: "spend" });
    else small += s.cents;
  }
  if (small > 0) big.push({ label: "Everything else", cents: small, per100Cents: per(small), kind: "spend" });
  if (taxPaidCents > 0) big.push({ label: "Taxes paid", cents: taxPaidCents, per100Cents: per(taxPaidCents), kind: "tax" });
  const out = spend.reduce((t, s) => t + s.cents, 0) + Math.max(0, taxPaidCents);
  const left = incomeCents - out;
  big.push(left >= 0 ? { label: "Kept", cents: left, per100Cents: per(left), kind: "left" } : { label: "Overspent", cents: -left, per100Cents: per(-left), kind: "over" });
  return big;
}
