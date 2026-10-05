import { pocketProgress } from "@/lib/budget/targets";
import { billStatus } from "@/lib/budget/bills";
import type { EnvelopeRow } from "@/lib/budget/summary";
import type { PocketVM } from "@/lib/budget/board-types";
import { monthParam } from "@/lib/utils/dates";

/** One envelope as the client screens see it (progress toward its target, bill status). */
export function toVM(r: EnvelopeRow, month: Date, today: string): PocketVM {
  const progress = pocketProgress(
    {
      assignedCents: r.assignedCents, activityCents: r.activityCents, availableCents: r.availableCents,
      targetType: r.targetType, targetCents: r.targetCents, targetDate: r.targetDate ? new Date(`${r.targetDate}T00:00:00.000Z`) : null,
    },
    month
  );
  return {
    id: r.id, name: r.name, groupId: r.groupId, assignedCents: r.assignedCents, activityCents: r.activityCents,
    availableCents: r.availableCents, isSystemManaged: r.isSystemManaged, isTaxDeductible: r.isTaxDeductible,
    priorityRank: r.priorityRank, targetType: r.targetType, targetCents: r.targetCents, targetDate: r.targetDate,
    allocationBps: r.allocationBps, dueDay: r.dueDay, manualPaid: r.manualPaid, kind: r.type, expenseType: r.expenseType, incomeKind: r.incomeKind, progress,
    bill: r.type === "INCOME" ? null : billStatus({
      dueDay: r.dueDay, monthIso: monthParam(month), todayIso: today, manualPaid: r.manualPaid,
      spentCents: Math.max(0, -r.activityCents), targetCents: r.targetType === "MONTHLY_FUNDING" ? r.targetCents : null,
    }),
  };
}
