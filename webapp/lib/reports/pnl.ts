import "server-only";
import { prisma } from "@/lib/prisma";
import { historyActivity } from "@/lib/history-activity";
import { OWNER_DRAW, deductibleShareBps, effectiveType, typeLabel } from "@/lib/budget/expense-types";

export interface PnlPocket { id: string; name: string; cents: number; deductible: boolean }
export interface PnlTypeRow { key: string; label: string; cents: number; prevCents: number; pockets: PnlPocket[] }
export interface Pnl {
  revenue: PnlTypeRow[]; expenses: PnlTypeRow[];
  revenueCents: number; expenseCents: number; netCents: number;
  prevRevenueCents: number; prevExpenseCents: number; prevNetCents: number;
  deductibleCents: number; taxPaymentsCents: number;
  uncategorizedCents: number; uncategorizedCount: number;
}

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** Per-category net activity (signed cents) for a window. Splits are authoritative over a transaction's own category; transfers are ignored. */
export async function activity(workspaceId: string, from: string, to: string) {
  const range = { gte: d(from), lte: d(to) };
  const [direct, splits, uncat] = await Promise.all([
    prisma.transaction.groupBy({ by: ["categoryId"], where: { workspaceId, categoryId: { not: null }, date: range, splits: { none: {} }, transferGroupId: null }, _sum: { amountCents: true } }),
    prisma.transactionSplit.groupBy({ by: ["categoryId"], where: { transaction: { workspaceId, date: range, transferGroupId: null } }, _sum: { amountCents: true } }),
    prisma.transaction.aggregate({ where: { workspaceId, categoryId: null, date: range, splits: { none: {} }, transferGroupId: null }, _sum: { amountCents: true }, _count: true }),
  ]);
  const m = new Map<string, number>();
  for (const r of [...direct, ...splits]) if (r.categoryId) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + (r._sum.amountCents ?? 0));
  return { byCategory: m, uncategorizedCents: uncat._sum.amountCents ?? 0, uncategorizedCount: uncat._count };
}

export async function buildPnl(workspaceId: string, p: { from: string; to: string; prevFrom: string; prevTo: string }): Promise<Pnl> {
  const [cur, prev, cats] = await Promise.all([
    activity(workspaceId, p.from, p.to),
    activity(workspaceId, p.prevFrom, p.prevTo),
    prisma.category.findMany({ where: { workspaceId } }),
  ]);
  const rev = new Map<string, PnlTypeRow>(), exp = new Map<string, PnlTypeRow>();
  let deductibleCents = 0, taxPaymentsCents = 0, prevRevenue = 0, prevExpense = 0;

  for (const c of cats) {
    const a = cur.byCategory.get(c.id) ?? 0;
    const b = prev.byCategory.get(c.id) ?? 0;
    if (a === 0 && b === 0) continue;
    if (c.type === "SYSTEM") { taxPaymentsCents += -a; continue; }
    const isIncome = c.type === "INCOME";
    const sign = isIncome ? 1 : -1; // expenses are stored negative; refunds net against them
    if (!isIncome && c.expenseType === OWNER_DRAW) continue; // personal use is not a business expense
    const key = effectiveType(c) ?? (isIncome ? "UNCLASSIFIED_INCOME" : "UNCLASSIFIED");
    const label = typeLabel(key) ?? (isIncome ? "Unclassified income" : "Unclassified");
    const map = isIncome ? rev : exp;
    const row = map.get(key) ?? { key, label, cents: 0, prevCents: 0, pockets: [] };
    row.cents += sign * a; row.prevCents += sign * b;
    if (a !== 0) row.pockets.push({ id: c.id, name: c.name, cents: sign * a, deductible: c.isTaxDeductible });
    map.set(key, row);
    if (isIncome) prevRevenue += b; else prevExpense += -b;
    if (!isIncome && c.isTaxDeductible) deductibleCents += Math.round((-a * deductibleShareBps(key)) / 10000);
  }
  // Past years from the History layer (only non-empty for windows that reach before go-live).
  const isBiz = (await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { type: true } }))?.type === "BUSINESS";
  const [hCur, hPrev] = await Promise.all([historyActivity(workspaceId, p.from, p.to, isBiz), historyActivity(workspaceId, p.prevFrom, p.prevTo, isBiz)]);
  const mergeHistory = (map: Map<string, PnlTypeRow>, cur: Map<string, number>, prev: Map<string, number>, unclassifiedKey: string, fallbackLabel: string) => {
    for (const k of new Set([...cur.keys(), ...prev.keys()])) {
      const key = k === unclassifiedKey ? (unclassifiedKey) : k;
      const row = map.get(key) ?? { key, label: typeLabel(key) ?? fallbackLabel, cents: 0, prevCents: 0, pockets: [] };
      const c = cur.get(k) ?? 0, pv = prev.get(k) ?? 0;
      row.cents += c; row.prevCents += pv;
      if (c !== 0) row.pockets.push({ id: `history:${key}`, name: "History (past years)", cents: c, deductible: false });
      map.set(key, row);
    }
  };
  mergeHistory(rev, hCur.revenue, hPrev.revenue, "UNCLASSIFIED_INCOME", "Unclassified income");
  mergeHistory(exp, hCur.expenses, hPrev.expenses, "UNCLASSIFIED", "Unclassified");
  for (const v of hPrev.revenue.values()) prevRevenue += v;
  for (const v of hPrev.expenses.values()) prevExpense += v;
  deductibleCents += hCur.deductibleCents;
  const sorted = (m: Map<string, PnlTypeRow>) => [...m.values()].map((r) => ({ ...r, pockets: r.pockets.sort((x, y) => y.cents - x.cents) })).sort((x, y) => y.cents - x.cents);
  const revenue = sorted(rev), expenses = sorted(exp);
  const revenueCents = revenue.reduce((s, r) => s + r.cents, 0);
  const expenseCents = expenses.reduce((s, r) => s + r.cents, 0);
  return {
    revenue, expenses, revenueCents, expenseCents, netCents: revenueCents - expenseCents,
    prevRevenueCents: prevRevenue, prevExpenseCents: prevExpense, prevNetCents: prevRevenue - prevExpense,
    deductibleCents, taxPaymentsCents, uncategorizedCents: cur.uncategorizedCents, uncategorizedCount: cur.uncategorizedCount,
  };
}

/** 30.00 -> basis points (3000). Rate lives on TaxProfile; default 30%. */
export async function taxRateBps(workspaceId: string): Promise<number> {
  const t = await prisma.taxProfile.findUnique({ where: { workspaceId } });
  return Math.round(Number(t?.reserveRatePercent ?? 30) * 100);
}

export interface PersonRow { id: string | null; name: string; spentCents: number; receivedCents: number; count: number }

/** Spending (money out of expense pockets) and income received, per household member, for the window. */
export async function byPerson(workspaceId: string, from: string, to: string): Promise<PersonRow[]> {
  const range = { gte: d(from), lte: d(to) };
  const [users, spent, received] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, email: true } }),
    prisma.transaction.groupBy({ by: ["personId"], where: { workspaceId, date: range, transferGroupId: null, amountCents: { lt: 0 }, OR: [{ category: { type: "EXPENSE" } }, { categoryId: null }, { splits: { some: {} } }] }, _sum: { amountCents: true }, _count: true }),
    prisma.transaction.groupBy({ by: ["personId"], where: { workspaceId, date: range, transferGroupId: null, amountCents: { gt: 0 }, category: { type: "INCOME" } }, _sum: { amountCents: true } }),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name || u.email.split("@")[0]]));
  const ids = new Set<string | null>([...spent.map((s) => s.personId), ...received.map((s) => s.personId)]);
  return [...ids].map((id) => ({
    id, name: id ? name.get(id) ?? "Former member" : "Not assigned",
    spentCents: -(spent.find((s) => s.personId === id)?._sum.amountCents ?? 0),
    receivedCents: received.find((s) => s.personId === id)?._sum.amountCents ?? 0,
    count: spent.find((s) => s.personId === id)?._count ?? 0,
  })).sort((a, b) => b.spentCents - a.spentCents);
}
