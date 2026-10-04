import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Ready to Assign, as of the end of `asOfDate` (inclusive):
 *
 *   RTA = starting balances of on-budget accounts (dated on or before asOfDate)
 *       + cumulative inflow to on-budget accounts categorized as INCOME
 *       − cumulative BudgetAssignment.amountCents across every category
 *         and month, for this workspace
 *
 * This matches the schema's ENVELOPE ENGINE header note exactly. It is
 * intentionally NOT cached — RTA is a running pool, not a per-month value,
 * so it has to be summed from the beginning of the workspace's history
 * every time. If that becomes a performance problem at real data volumes,
 * add a materialized cache behind this same function signature rather than
 * changing callers.
 *
 * Uncategorized inflows (categoryId null, not a transfer) deliberately do
 * NOT count toward RTA here — they should be flagged for review and given a
 * real category (INCOME or otherwise) rather than silently inflating the
 * assignable pool.
 */
export async function getReadyToAssign(
  db: Db,
  workspaceId: string,
  asOfDate: Date
): Promise<number> {
  const periodEnd = new Date(
    Date.UTC(
      asOfDate.getUTCFullYear(),
      asOfDate.getUTCMonth(),
      asOfDate.getUTCDate() + 1
    )
  ); // exclusive upper bound — includes all of asOfDate

  const [openingSum, incomeSum, assignedSum] = await Promise.all([
    // An account's starting balance is money you already have, so it is ready to assign (a negative one, like card debt, reduces it).
    db.account.aggregate({
      where: {
        workspaceId,
        onBudget: true,
        balanceMode: "TRANSACTION_DERIVED",
        OR: [{ openingBalanceDate: null }, { openingBalanceDate: { lt: periodEnd } }],
      },
      _sum: { openingBalanceCents: true },
    }),
    db.transaction.aggregate({
      where: {
        workspaceId,
        date: { lt: periodEnd },
        account: { onBudget: true },
        category: { type: "INCOME" },
      },
      _sum: { amountCents: true },
    }),
    db.budgetAssignment.aggregate({
      where: {
        category: { workspaceId },
        month: { lt: periodEnd },
      },
      _sum: { amountCents: true },
    }),
  ]);

  const opening = openingSum._sum.openingBalanceCents ?? 0;
  const income = incomeSum._sum.amountCents ?? 0;
  const assigned = assignedSum._sum.amountCents ?? 0;
  return opening + income - assigned;
}
