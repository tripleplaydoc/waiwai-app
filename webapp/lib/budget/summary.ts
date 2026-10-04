import "server-only";
import { prisma } from "@/lib/prisma";
import { addMonthsUTC } from "@/lib/budget/dates";
import { getReadyToAssign } from "@/lib/budget/ready-to-assign";
import { effectiveType } from "@/lib/budget/expense-types";

export interface EnvelopeRow {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE" | "SYSTEM";
  groupId: string | null;
  groupName: string;
  assignedCents: number; // assigned this month
  activityCents: number; // spending (negative) / income (positive) this month
  availableCents: number; // rolling: all assignments - all activity through this month
  priorityRank: number | null;
  isSystemManaged: boolean;
  isTaxDeductible: boolean;
  targetType: "MONTHLY_FUNDING" | "TARGET_BALANCE" | "TARGET_BALANCE_BY_DATE" | null;
  targetCents: number | null;
  targetDate: string | null; // YYYY-MM-DD
  allocationBps: number | null;
  dueDay: number | null;
  manualPaid: boolean;
  expenseType: string | null;
}

export interface GroupRow {
  id: string | null;
  name: string;
  allocationBps: number | null;
  rows: EnvelopeRow[];
}

export interface BudgetSummary {
  readyToAssignCents: number;
  rows: EnvelopeRow[];
  groups: GroupRow[];
  totalAssignedCents: number;
  totalActivityCents: number;
  totalAvailableCents: number;
}

/**
 * Everything the budget screen needs for one month, using grouped queries
 * (a handful of round trips total, not one per envelope).
 *
 * Activity follows the schema rule for split transactions: when a
 * transaction has split rows, the splits are authoritative and the
 * transaction's own categoryId is ignored.
 */
export async function getBudgetSummary(workspaceId: string, month: Date): Promise<BudgetSummary> {
  const nextMonth = addMonthsUTC(month, 1);

  const [groupsDb, categories, assignedMonth, assignedCum, directCum, directMonth, splitCum, splitMonth, rta, paidRows] =
    await Promise.all([
      prisma.categoryGroup.findMany({ where: { workspaceId, isArchived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.category.findMany({ where: { workspaceId, isArchived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.budgetAssignment.groupBy({ by: ["categoryId"], where: { category: { workspaceId }, month }, _sum: { amountCents: true } }),
      prisma.budgetAssignment.groupBy({ by: ["categoryId"], where: { category: { workspaceId }, month: { lte: month } }, _sum: { amountCents: true } }),
      prisma.transaction.groupBy({ by: ["categoryId"], where: { workspaceId, categoryId: { not: null }, date: { lt: nextMonth }, splits: { none: {} } }, _sum: { amountCents: true } }),
      prisma.transaction.groupBy({ by: ["categoryId"], where: { workspaceId, categoryId: { not: null }, date: { gte: month, lt: nextMonth }, splits: { none: {} } }, _sum: { amountCents: true } }),
      prisma.transactionSplit.groupBy({ by: ["categoryId"], where: { transaction: { workspaceId, date: { lt: nextMonth } } }, _sum: { amountCents: true } }),
      prisma.transactionSplit.groupBy({ by: ["categoryId"], where: { transaction: { workspaceId, date: { gte: month, lt: nextMonth } } }, _sum: { amountCents: true } }),
      getReadyToAssign(prisma, workspaceId, new Date(nextMonth.getTime() - 1)),
      prisma.billPayment.findMany({ where: { category: { workspaceId }, month }, select: { categoryId: true } }),
    ]);
  const paidSet = new Set(paidRows.map((r) => r.categoryId));

  const toMap = (rows: { categoryId: string | null; _sum: { amountCents: number | null } }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.categoryId) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + (r._sum.amountCents ?? 0));
    return m;
  };
  const aM = toMap(assignedMonth), aC = toMap(assignedCum);
  const dC = toMap(directCum), dM = toMap(directMonth), sC = toMap(splitCum), sM = toMap(splitMonth);
  const groupName = new Map(groupsDb.map((g) => [g.id, g.name]));

  const rows: EnvelopeRow[] = categories.map((c) => {
    const activityMonth = (dM.get(c.id) ?? 0) + (sM.get(c.id) ?? 0);
    const activityCum = (dC.get(c.id) ?? 0) + (sC.get(c.id) ?? 0);
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      groupId: c.categoryGroupId,
      groupName: c.categoryGroupId ? groupName.get(c.categoryGroupId) ?? "Other" : "Other",
      assignedCents: aM.get(c.id) ?? 0,
      activityCents: activityMonth,
      availableCents: c.type === "INCOME" ? 0 : (aC.get(c.id) ?? 0) + activityCum,
      priorityRank: c.priorityRank,
      isSystemManaged: c.isSystemManaged,
      isTaxDeductible: c.isTaxDeductible,
      targetType: c.fundingTargetType,
      targetCents: c.fundingTargetCents,
      targetDate: c.fundingTargetByDate ? c.fundingTargetByDate.toISOString().slice(0, 10) : null,
      allocationBps: c.allocationBps,
      dueDay: c.dueDay,
      manualPaid: paidSet.has(c.id),
      expenseType: effectiveType(c),
    };
  });

  const groups: BudgetSummary["groups"] = [];
  for (const g of groupsDb) {
    const gRows = rows.filter((r) => r.groupId === g.id);
    groups.push({ id: g.id, name: g.name, allocationBps: g.allocationBps, rows: gRows }); // empty groups stay visible
  }
  const loose = rows.filter((r) => !r.groupId || !groupName.has(r.groupId));
  if (loose.length) groups.push({ id: null, name: "Other", allocationBps: null, rows: loose });

  const env = rows.filter((r) => r.type !== "INCOME");
  return {
    readyToAssignCents: rta,
    rows,
    groups,
    totalAssignedCents: env.reduce((s, r) => s + r.assignedCents, 0),
    totalActivityCents: env.reduce((s, r) => s + r.activityCents, 0),
    totalAvailableCents: env.reduce((s, r) => s + r.availableCents, 0),
  };
}

/** On-budget + off-budget balances: opening balance + sum of the account's transactions. */
export async function getAccountBalances(workspaceId: string) {
  const [accounts, sums] = await Promise.all([
    prisma.account.findMany({ where: { workspaceId, isArchived: false }, orderBy: [{ onBudget: "desc" }, { name: "asc" }] }),
    prisma.transaction.groupBy({ by: ["accountId"], where: { workspaceId }, _sum: { amountCents: true } }),
  ]);
  const sumBy = new Map(sums.map((s) => [s.accountId, s._sum.amountCents ?? 0]));
  return accounts.map((a) => ({ ...a, balanceCents: a.openingBalanceCents + (sumBy.get(a.id) ?? 0) }));
}
