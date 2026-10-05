import { budgetHealth, pocketProgress, type BudgetHealth } from "./targets";
import type { BudgetSummary } from "./summary";

/** The same runway numbers the budget page used to show, for any month's summary. */
export function healthFromSummary(summary: BudgetSummary, month: Date): BudgetHealth {
  const pockets = summary.rows.filter((r) => r.type !== "INCOME").map((r) => {
    const input = {
      assignedCents: r.assignedCents, activityCents: r.activityCents, availableCents: r.availableCents,
      targetType: r.targetType, targetCents: r.targetCents, targetDate: r.targetDate ? new Date(`${r.targetDate}T00:00:00.000Z`) : null,
      manualPaid: r.manualPaid, monthsAhead: r.monthsAhead,
    };
    return { input, progress: pocketProgress(input, month) };
  });
  return budgetHealth(pockets, summary.readyToAssignCents);
}
