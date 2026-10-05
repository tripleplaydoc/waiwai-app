/** Growth numbers. Money is integer cents. */
/** Share of income kept, as a whole percent (negative = spending more than earned). */
export const savingsRatePct = (incomeCents: number, spendCents: number): number | null => (incomeCents > 0 ? Math.round(((incomeCents - spendCents) / incomeCents) * 100) : null);

/** How many days the cash on hand would last at the recent pace of spending. */
export function runwayDays(cashCents: number, spendCents: number, windowDays: number): number | null {
  if (spendCents <= 0 || windowDays <= 0) return null;
  return Math.max(0, Math.round(cashCents / (spendCents / windowDays)));
}

/** The nest egg whose 4% yearly withdrawal covers a year of spending: 25 x annual spending. */
export function freedomNumberCents(spendCents: number, windowDays: number): number | null {
  if (spendCents <= 0 || windowDays <= 0) return null;
  return Math.round((spendCents / windowDays) * 365) * 25;
}

/** Years to reach a target at a steady monthly gain (no extra returns assumed). Null when not growing. */
export function yearsToTarget(currentCents: number, targetCents: number, monthlyGainCents: number): number | null {
  if (currentCents >= targetCents) return 0;
  if (monthlyGainCents <= 0) return null;
  return Math.round(((targetCents - currentCents) / monthlyGainCents / 12) * 10) / 10;
}
