import "server-only";
import { prisma } from "@/lib/prisma";
import { getBudgetSummary, type EnvelopeRow } from "@/lib/budget/summary";
import { cashTrend } from "@/lib/home-trend";
import type { StartCounts } from "@/lib/home-start";
import { addDays } from "@/lib/forecast-math";
import type { LegacyPocket } from "@/lib/generations";
import { isoToDate } from "@/lib/utils/dates";

/** Counts that tell us how far through first-time setup this budget is. */
export async function loadStartCounts(workspaceId: string): Promise<StartCounts> {
  const [accounts, pockets, assignments, transactions] = await Promise.all([
    prisma.account.count({ where: { workspaceId, isArchived: false } }),
    prisma.category.count({ where: { workspaceId, isArchived: false, type: { not: "INCOME" }, isSystemManaged: false } }),
    prisma.budgetAssignment.count({ where: { category: { workspaceId } } }),
    prisma.transaction.count({ where: { workspaceId } }),
  ]);
  return { accounts, pockets, assignments, transactions };
}

/** Cash on hand at the end of each of the last 30 days, worked backwards from today's balance (moves between your own cash accounts cancel out). */
export async function loadCashTrend(workspaceId: string, cashIds: string[], endCents: number, today: string): Promise<number[]> {
  if (cashIds.length === 0) return [];
  const ids = new Set(cashIds);
  const rows = await prisma.transaction.findMany({
    where: { workspaceId, accountId: { in: cashIds }, date: { gt: isoToDate(addDays(today, -30)), lte: isoToDate(today) } },
    select: { date: true, amountCents: true, transferAccountId: true },
  });
  const moves = rows.filter((t) => !(t.transferAccountId && ids.has(t.transferAccountId))).map((t) => ({ date: t.date.toISOString().slice(0, 10), cents: t.amountCents }));
  return cashTrend(endCents, moves, today, 30);
}

export interface Recent { id: string; date: string; label: string; cents: number }

/** The latest money in and out (transfers between your own accounts left out). */
export async function loadRecent(workspaceId: string, take = 6): Promise<Recent[]> {
  const rows = await prisma.transaction.findMany({
    where: { workspaceId, transferAccountId: null },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
    select: { id: true, date: true, amountCents: true, memo: true, payee: { select: { name: true } }, category: { select: { name: true } } },
  });
  return rows.map((t) => ({ id: t.id, date: t.date.toISOString().slice(0, 10), label: t.payee?.name || t.memo || t.category?.name || (t.amountCents > 0 ? "Money in" : "Money out"), cents: t.amountCents }));
}

export interface Goal { id: string; name: string; savedCents: number; targetCents: number; fraction: number; reached: boolean; byDate: string | null }

/** Pockets saved for the next generation, with what is in them and the goal (if one was set). */
export function legacyPockets(rows: EnvelopeRow[]): LegacyPocket[] {
  return rows
    .filter((r) => r.type === "EXPENSE" && !r.isSystemManaged && r.legacy)
    .map((r) => ({
      id: r.id, name: r.name, savedCents: Math.max(0, r.availableCents),
      targetCents: (r.targetType === "TARGET_BALANCE" || r.targetType === "TARGET_BALANCE_BY_DATE") && (r.targetCents ?? 0) > 0 ? (r.targetCents as number) : null,
    }));
}

/**
 * Savings goals = pockets that have a "reach this balance" target (pockets saved for the next generation are listed
 * apart, as `gifts`). Also returns what is set aside in them, so the "You can spend" figure can leave that money alone.
 */
export async function loadGoals(workspaceId: string, month: Date): Promise<{ goals: Goal[]; gifts: Goal[]; setAsideCents: number; spendableCents: number | null }> {
  const summary = await getBudgetSummary(workspaceId, month);
  const mk = (r: EnvelopeRow): Goal => {
    const target = r.targetCents ?? 0;
    const hasGoal = (r.targetType === "TARGET_BALANCE" || r.targetType === "TARGET_BALANCE_BY_DATE") && target > 0;
    const saved = Math.max(0, r.availableCents);
    return { id: r.id, name: r.name, savedCents: saved, targetCents: hasGoal ? target : 0, fraction: hasGoal ? Math.min(1, saved / target) : 0, reached: hasGoal && saved >= target, byDate: hasGoal ? r.targetDate : null };
  };
  const pockets = summary.rows.filter((r) => r.type === "EXPENSE" && !r.isSystemManaged);
  const goals = pockets.filter((r) => !r.legacy && (r.targetType === "TARGET_BALANCE" || r.targetType === "TARGET_BALANCE_BY_DATE") && (r.targetCents ?? 0) > 0).map(mk);
  const gifts = pockets.filter((r) => r.legacy).map(mk);
  const spendRows = summary.rows.filter((r) => r.type === "EXPENSE" && r.spendable);
  // null = nothing is marked as spending money yet, so callers fall back to "cash minus goals".
  const spendableCents = spendRows.length ? spendRows.reduce((s, r) => s + Math.max(0, r.availableCents), 0) : null;
  return { goals, gifts, setAsideCents: [...goals, ...gifts].reduce((s, g) => s + g.savedCents, 0), spendableCents };
}
