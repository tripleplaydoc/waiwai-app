import type { Prisma, PrismaClient } from "@prisma/client";
import { addMonthsUTC, startOfMonthUTC } from "./dates";

/** Accepts either the top-level client or an interactive `$transaction` client. */
type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Sum of BudgetAssignment.amountCents for a category within a single month.
 * This is "assigned this month" — what MONTHLY_FUNDING targets compare
 * against.
 */
export async function getCategoryAssignedForMonth(
  db: Db,
  categoryId: string,
  month: Date
): Promise<number> {
  const monthStart = startOfMonthUTC(month);
  const result = await db.budgetAssignment.aggregate({
    where: { categoryId, month: monthStart },
    _sum: { amountCents: true },
  });
  return result._sum.amountCents ?? 0;
}

/**
 * Sum of category "activity" (transaction spend/refunds, signed cents) from
 * the beginning of time through the last day of `asOfMonth`.
 *
 * Reads BOTH plain Transaction rows (categoryId set directly) AND
 * TransactionSplit rows, and deliberately EXCLUDES the direct-categoryId
 * sum for any transaction that has split rows — once a transaction is
 * split, its own categoryId is no longer authoritative for activity (see
 * schema header note on SPLIT TRANSACTIONS). Without that exclusion, a
 * split transaction's amount would be counted twice.
 */
export async function getCategoryActivityCumulative(
  db: Db,
  categoryId: string,
  asOfMonth: Date
): Promise<number> {
  const periodEnd = addMonthsUTC(asOfMonth, 1); // exclusive upper bound

  const [directSum, splitSum] = await Promise.all([
    db.transaction.aggregate({
      where: {
        categoryId,
        date: { lt: periodEnd },
        splits: { none: {} },
      },
      _sum: { amountCents: true },
    }),
    db.transactionSplit.aggregate({
      where: {
        categoryId,
        transaction: { date: { lt: periodEnd } },
      },
      _sum: { amountCents: true },
    }),
  ]);

  return (directSum._sum.amountCents ?? 0) + (splitSum._sum.amountCents ?? 0);
}

/**
 * Sum of BudgetAssignment.amountCents for a category across every month up
 * to and including `asOfMonth`.
 */
export async function getCategoryAssignedCumulative(
  db: Db,
  categoryId: string,
  asOfMonth: Date
): Promise<number> {
  const monthEnd = startOfMonthUTC(asOfMonth);
  const result = await db.budgetAssignment.aggregate({
    where: { categoryId, month: { lte: monthEnd } },
    _sum: { amountCents: true },
  });
  return result._sum.amountCents ?? 0;
}

/**
 * A category's rolling "available" balance as of a given month: cumulative
 * assignments minus cumulative activity. This is the envelope balance shown
 * in the UI, and — per the schema's ENVELOPE ENGINE note — is always
 * computed live rather than cached, to avoid drift from the ledger that
 * produced it.
 */
export async function getCategoryAvailableBalance(
  db: Db,
  categoryId: string,
  asOfMonth: Date
): Promise<number> {
  const [assigned, activity] = await Promise.all([
    getCategoryAssignedCumulative(db, categoryId, asOfMonth),
    getCategoryActivityCumulative(db, categoryId, asOfMonth),
  ]);
  // activity is stored signed (negative = spend), so this is a plain sum.
  return assigned + activity;
}
