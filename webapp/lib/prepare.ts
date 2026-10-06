import { prisma } from "@/lib/prisma";
import { getBudgetSummary } from "@/lib/budget/summary";
import { toVM } from "@/lib/budget/to-vm";
import { budgetHealth } from "@/lib/budget/targets";
import { loadCardStatuses } from "@/lib/budget/cards";
import { loadLoans } from "@/lib/budget/loans-state";
import { monthFromParam, monthParam } from "@/lib/utils/dates";
import { taxRateBps } from "@/lib/reports/pnl";
import type { DebtIn } from "@/lib/prepare-math";

export interface PrepareBase {
  monthlyCostCents: number; unfundedCents: number; cushionHeldCents: number;
  debts: DebtIn[]; hasTaxReservePocket: boolean; taxBps: number;
  /** Money coming in this month so far, for context. */
  incomeThisMonthCents: number;
  hasGrowthPocket: boolean;
}

/** What the plan looks like today, so the simulator can measure extra money against it. */
export async function loadPrepareBase(workspaceId: string, isBusiness: boolean, todayIso: string): Promise<PrepareBase> {
  const month = monthFromParam(undefined);
  const summary = await getBudgetSummary(workspaceId, month);
  const rows = summary.rows.filter((r) => r.type !== "INCOME");
  const vms = rows.map((r) => toVM(r, month, todayIso));
  const health = budgetHealth(vms.map((p) => ({
    input: { assignedCents: p.assignedCents, activityCents: p.activityCents, availableCents: p.availableCents, targetType: p.targetType, targetCents: p.targetCents, targetDate: p.targetDate ? new Date(`${p.targetDate}T00:00:00.000Z`) : null, manualPaid: p.manualPaid, monthsAhead: p.monthsAhead },
    progress: p.progress,
  })), summary.readyToAssignCents);

  const debts: DebtIn[] = [];
  try { for (const c of await loadCardStatuses(workspaceId, month)) if (c.owedCents > 0 && c.aprBps) debts.push({ name: c.name, balanceCents: c.owedCents, aprBps: c.aprBps }); } catch { /* cards are a bonus */ }
  try { for (const l of await loadLoans(workspaceId, monthParam(month), summary.rows, false)) if (l.phase !== "finished" && l.aprBps > 0) debts.push({ name: l.name, balanceCents: Math.max(l.remainingCents, l.balanceOwedCents), aprBps: l.aprBps }); } catch { /* loans are a bonus */ }

  return {
    monthlyCostCents: health.monthlyCostCents, unfundedCents: health.stillNeededCents, cushionHeldCents: health.pocketMoneyCents,
    debts, hasTaxReservePocket: summary.rows.some((r) => r.isSystemManaged && /tax/i.test(r.name)),
    taxBps: isBusiness ? await taxRateBps(workspaceId).catch(() => 3000) : 0,
    incomeThisMonthCents: summary.rows.filter((r) => r.type === "INCOME").reduce((s, r) => s + Math.max(0, r.activityCents), 0),
    hasGrowthPocket: rows.some((r) => r.expenseType === "SAVINGS" || /saving|invest|retire/i.test(r.name)),
  };
}
