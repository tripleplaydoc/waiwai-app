import "server-only";
import { prisma } from "@/lib/prisma";
import { effectiveType, typeLabel } from "@/lib/budget/expense-types";

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
async function activity(workspaceId: string, from: string, to: string) {
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
    const key = effectiveType(c) ?? (isIncome ? "UNCLASSIFIED_INCOME" : "UNCLASSIFIED");
    const label = typeLabel(key) ?? (isIncome ? "Unclassified income" : "Unclassified");
    const map = isIncome ? rev : exp;
    const row = map.get(key) ?? { key, label, cents: 0, prevCents: 0, pockets: [] };
    row.cents += sign * a; row.prevCents += sign * b;
    if (a !== 0) row.pockets.push({ id: c.id, name: c.name, cents: sign * a, deductible: c.isTaxDeductible });
    map.set(key, row);
    if (isIncome) prevRevenue += b; else prevExpense += -b;
    if (!isIncome && c.isTaxDeductible) deductibleCents += -a;
  }
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
