import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addMonthsUTC } from "@/lib/budget/dates";
import { getBudgetSummary } from "@/lib/budget/summary";
import { nextDayOfMonth } from "@/lib/cycle";
import { todayIso } from "@/lib/utils/dates";
import { computeCardShortfalls, type ShortPart } from "@/lib/budget/cards-math";

export interface CardStatus {
  id: string; name: string;
  /** What is owed on the card right now (0 when paid off or in credit). */
  owedCents: number;
  /** Part of what is owed that no pocket is covering. */
  shortCents: number;
  /** Part of what is owed that is backed by pockets. */
  setAsideCents: number;
  parts: ShortPart[];
  uncategorizedCents: number;
  aprBps: number | null;
  minPaymentCents: number;
  statementDay: number | null;
  dueDay: number | null;
  /** Next statement closing / payment due dates (ISO) and days away, from today. */
  nextStatement: { iso: string; days: number } | null;
  nextDue: { iso: string; days: number } | null;
}

/** Status of every on-budget credit card in a workspace, as of the end of `month`. */
export async function loadCardStatuses(workspaceId: string, month: Date): Promise<CardStatus[]> {
  const cards = await prisma.account.findMany({ where: { workspaceId, type: "CREDIT_CARD", isArchived: false, onBudget: true, balanceMode: "TRANSACTION_DERIVED" }, orderBy: { name: "asc" } });
  if (cards.length === 0) return [];
  const ids = cards.map((c) => c.id);
  const end = addMonthsUTC(month, 1);
  const [sums, spendRows, summary, details] = await Promise.all([
    prisma.transaction.groupBy({ by: ["accountId"], where: { accountId: { in: ids } }, _sum: { amountCents: true } }),
    // Net per card per pocket (splits take over from their parent transaction). Transfers (card payments) are not spending.
    prisma.$queryRaw<{ accountId: string; categoryId: string | null; s: bigint }[]>(Prisma.sql`
      SELECT t."accountId", COALESCE(sp."categoryId", t."categoryId") AS "categoryId", SUM(COALESCE(sp."amountCents", t."amountCents")) AS s
      FROM transactions t LEFT JOIN transaction_splits sp ON sp."transactionId" = t.id
      WHERE t."accountId" IN (${Prisma.join(ids)}) AND t.date < ${end} AND t."transferGroupId" IS NULL
      GROUP BY 1, 2`),
    getBudgetSummary(workspaceId, month),
    prisma.holdingDetail.findMany({ where: { accountId: { in: ids } } }),
  ]);
  const sumBy = new Map(sums.map((s) => [s.accountId, s._sum.amountCents ?? 0]));
  const owed: Record<string, number> = {};
  for (const c of cards) owed[c.id] = Math.max(0, -(c.openingBalanceCents + (sumBy.get(c.id) ?? 0)));
  const uncategorized: Record<string, number> = {};
  const spend = [];
  for (const r of spendRows) {
    const net = -Number(r.s); // positive = spent
    if (!r.categoryId) { if (net > 0) uncategorized[r.accountId] = (uncategorized[r.accountId] ?? 0) + net; continue; }
    spend.push({ cardId: r.accountId, categoryId: r.categoryId, spentCents: net });
  }
  const pockets = summary.rows.filter((r) => r.type !== "INCOME").map((r) => ({ id: r.id, name: r.name, availableCents: r.availableCents }));
  const short = computeCardShortfalls({ pockets, spend, uncategorized, owedCents: owed });
  const today = todayIso();
  return cards.map((c) => {
    const det = details.find((d) => d.accountId === c.id);
    return {
    id: c.id, name: c.name, owedCents: owed[c.id], shortCents: short[c.id].shortCents, setAsideCents: owed[c.id] - short[c.id].shortCents,
    parts: short[c.id].parts, uncategorizedCents: short[c.id].uncategorizedCents,
    aprBps: det?.interestRateBps ?? null, minPaymentCents: c.monthlyCashflowCents ?? 0,
    statementDay: det?.statementDay ?? null, dueDay: det?.dueDay ?? null,
    nextStatement: det?.statementDay ? nextDayOfMonth(det.statementDay, today) : null,
    nextDue: det?.dueDay ? nextDayOfMonth(det.dueDay, today) : null,
    };
  });
}
