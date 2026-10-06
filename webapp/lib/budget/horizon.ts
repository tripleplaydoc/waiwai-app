/** "Covered this month" versus "covered through next month too". Pure, integer cents. */
export type Horizon = "now" | "ahead";
export type BudgetMode = "simple" | "advanced";
export interface ViewPrefs { mode: BudgetMode; horizon: Horizon }

export const parseMode = (v: string | undefined | null): BudgetMode => (v === "advanced" ? "advanced" : "simple");
export const parseHorizon = (v: string | undefined | null): Horizon => (v === "ahead" ? "ahead" : "now");

export interface AheadInput {
  targetType: "MONTHLY_FUNDING" | "TARGET_BALANCE" | "TARGET_BALANCE_BY_DATE" | null;
  targetCents: number; availableCents: number; activityCents: number;
  /** What still has to be assigned to cover this month (from pocketProgress). */
  stillThisMonthCents: number;
}

/**
 * What must be assigned for this pocket to cover this month and next month with no new income.
 * Monthly costs: the rest of this month's cost plus another full month. Goals and everything else: just this month's need.
 */
export function aheadNeedCents(i: AheadInput): number {
  if (i.targetType !== "MONTHLY_FUNDING" || i.targetCents <= 0) return Math.max(0, i.stillThisMonthCents);
  const remainingThis = Math.max(0, i.targetCents - Math.max(0, -i.activityCents));
  const spare = Math.max(0, i.availableCents + i.stillThisMonthCents - remainingThis);
  return Math.max(0, i.stillThisMonthCents) + Math.max(0, i.targetCents - spare);
}

export function coverTotals(needs: number[], readyToAssignCents: number): { stillCents: number; canCover: boolean; shortfallCents: number } {
  const still = needs.reduce((s, n) => s + Math.max(0, n), 0);
  const rta = Math.max(0, readyToAssignCents);
  return { stillCents: still, canCover: rta >= still, shortfallCents: Math.max(0, still - rta) };
}
