import "server-only";
import { prisma } from "@/lib/prisma";
import { buildPnl, activity } from "./pnl";
import { holdingsAt, type HoldingRow } from "./holdings";

export type IncomeKindKey = "EARNED" | "PORTFOLIO" | "PASSIVE";
export interface Line { label: string; cents: number }
export interface CashflowStatement {
  income: { kind: IncomeKindKey; title: string; hint: string; lines: Line[]; totalCents: number }[];
  totalIncomeCents: number;
  expenses: Line[];
  totalExpensesCents: number;
  cashflowCents: number;
  /** Portfolio + passive income. When it covers expenses you are out of the "rat race". */
  passiveCents: number;
  /** passive / expenses, 0..n (null when there are no expenses). */
  freedomRatio: number | null;
  assets: HoldingRow[];
  liabilities: HoldingRow[];
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  netWorthCents: number;
  expectedMonthlyAssetIncomeCents: number;
  scheduledMonthlyDebtPaymentsCents: number;
}

const KINDS: { kind: IncomeKindKey; title: string; hint: string }[] = [
  { kind: "EARNED", title: "Earned income", hint: "Paychecks, sales and services — you trade time for it" },
  { kind: "PORTFOLIO", title: "Portfolio income", hint: "Interest, dividends and gains" },
  { kind: "PASSIVE", title: "Passive income", hint: "Rent, royalties and businesses you don't run day to day" },
];

/** A Cashflow-game style statement for the period: income by kind, expenses, what's left, and the balance sheet at the end. */
export async function buildCashflowStatement(workspaceId: string, p: { from: string; to: string; prevFrom: string; prevTo: string }, asOf: string): Promise<CashflowStatement> {
  const [pnl, act, incomeCats] = await Promise.all([
    buildPnl(workspaceId, p),
    activity(workspaceId, p.from, p.to),
    prisma.category.findMany({ where: { workspaceId, type: "INCOME" } }),
  ]);
  const income = KINDS.map((k) => {
    const lines = incomeCats
      .filter((c) => (c.incomeKind ?? "EARNED") === k.kind)
      .map((c) => ({ label: c.name, cents: act.byCategory.get(c.id) ?? 0 }))
      .filter((l) => l.cents !== 0)
      .sort((a, b) => b.cents - a.cents);
    return { ...k, lines, totalCents: lines.reduce((s, l) => s + l.cents, 0) };
  });
  const totalIncome = income.reduce((s, i) => s + i.totalCents, 0);

  const expenses: Line[] = pnl.expenses.map((r) => ({ label: r.label, cents: r.cents }));
  if (pnl.taxPaymentsCents > 0) expenses.push({ label: "Taxes paid", cents: pnl.taxPaymentsCents });
  expenses.sort((a, b) => b.cents - a.cents);
  const totalExpenses = expenses.reduce((s, l) => s + l.cents, 0);

  const holdings = await holdingsAt([workspaceId], asOf);
  const assets = holdings.filter((h) => h.side === "ASSET" && h.valueCents !== 0).sort((a, b) => b.valueCents - a.valueCents);
  const liabilities = holdings.filter((h) => h.side === "LIABILITY" && h.valueCents !== 0).sort((a, b) => b.valueCents - a.valueCents);
  const passive = income.filter((i) => i.kind !== "EARNED").reduce((s, i) => s + i.totalCents, 0);
  const totalAssets = assets.reduce((s, h) => s + h.valueCents, 0), totalLiab = liabilities.reduce((s, h) => s + h.valueCents, 0);
  return {
    income, totalIncomeCents: totalIncome, expenses, totalExpensesCents: totalExpenses, cashflowCents: totalIncome - totalExpenses,
    passiveCents: passive, freedomRatio: totalExpenses > 0 ? passive / totalExpenses : null,
    assets, liabilities, totalAssetsCents: totalAssets, totalLiabilitiesCents: totalLiab, netWorthCents: totalAssets - totalLiab,
    expectedMonthlyAssetIncomeCents: assets.reduce((s, h) => s + h.monthlyCashflowCents, 0),
    scheduledMonthlyDebtPaymentsCents: liabilities.reduce((s, h) => s + h.monthlyCashflowCents, 0),
  };
}
