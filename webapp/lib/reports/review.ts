import "server-only";
import { prisma } from "@/lib/prisma";
import type { ExpenseTagKey } from "@/lib/budget/expense-tags";

export type Answer = "YES" | "NO" | "UNSURE";
export type Value = "CAPACITY" | "RISK" | "STRENGTH";
export interface ReviewRow {
  id: string; date: string; payee: string; pocket: string; cents: number; tags: ExpenseTagKey[];
  review: { increasesRevenue: Answer | null; strategicValue: Value[]; stewardship: Answer | null; notes: string } | null;
}
export interface ReviewSummary {
  count: number; reviewed: number; totalCents: number;
  revenue: Record<Answer | "UNANSWERED", number>;       // dollars by answer
  stewardship: Record<Answer | "UNANSWERED", number>;
  value: Record<Value | "NONE", number>;                  // dollars (an expense counts under each value it has)
}
const LIMIT = 300;

export async function loadReview(workspaceId: string, from: string, to: string): Promise<{ rows: ReviewRow[]; summary: ReviewSummary; truncated: boolean }> {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const where = { workspaceId, date: { gte: d(from), lte: d(to) }, amountCents: { lt: 0 }, transferGroupId: null, category: { type: "EXPENSE" as const } };
  const [txs, total] = await Promise.all([
    prisma.transaction.findMany({ where, orderBy: [{ amountCents: "asc" }, { date: "desc" }], take: LIMIT, include: { payee: true, category: true, expenseReview: true } }),
    prisma.transaction.count({ where }),
  ]);
  const rows: ReviewRow[] = txs.map((t) => ({
    id: t.id, date: t.date.toISOString().slice(0, 10), payee: t.payee?.name ?? t.memo ?? "No payee", pocket: t.category?.name ?? "",
    cents: -t.amountCents, tags: t.tags as ExpenseTagKey[],
    review: t.expenseReview ? { increasesRevenue: t.expenseReview.increasesRevenue, strategicValue: t.expenseReview.strategicValue as Value[], stewardship: t.expenseReview.stewardship, notes: t.expenseReview.notes ?? "" } : null,
  }));
  const summary: ReviewSummary = {
    count: rows.length, reviewed: 0, totalCents: 0,
    revenue: { YES: 0, NO: 0, UNSURE: 0, UNANSWERED: 0 }, stewardship: { YES: 0, NO: 0, UNSURE: 0, UNANSWERED: 0 },
    value: { CAPACITY: 0, RISK: 0, STRENGTH: 0, NONE: 0 },
  };
  for (const r of rows) {
    summary.totalCents += r.cents;
    const rv = r.review;
    if (rv && (rv.increasesRevenue || rv.stewardship || rv.strategicValue.length)) summary.reviewed++;
    summary.revenue[rv?.increasesRevenue ?? "UNANSWERED"] += r.cents;
    summary.stewardship[rv?.stewardship ?? "UNANSWERED"] += r.cents;
    if (!rv || rv.strategicValue.length === 0) summary.value.NONE += r.cents;
    else for (const v of rv.strategicValue) summary.value[v] += r.cents;
  }
  return { rows, summary, truncated: total > LIMIT };
}
