import type { Prisma, PrismaClient } from "@prisma/client";
import { POOL_INFLOW } from "./pool-inflow";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Ready to Assign, as of the end of `asOfDate` (inclusive):
 *
 *   RTA = starting balances of on-budget, non-credit-card accounts (dated on or before asOfDate)
 *       + cumulative money in to on-budget accounts (see POOL_INFLOW: Income-
 *         categorized inflows, plus any other money in that has no pocket yet)
 *       − cumulative BudgetAssignment.amountCents across every category
 *         and month, for this workspace
 *
 * It is intentionally NOT cached — RTA is a running pool, not a per-month
 * value, so it has to be summed from the beginning of the workspace's
 * history every time. If that becomes a performance problem at real data
 * volumes, add a materialized cache behind this same function signature
 * rather than changing callers.
 *
 * All money coming in lands in the pool first; it is then assigned out to
 * pockets. Transfers between your own accounts never count (they only move
 * money), and money filed under a spending pocket (a refund) reduces that
 * pocket's spending instead of the pool.
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
    // An account's starting balance is money you already have, so it is ready to assign. Credit cards are left out: what you owe on a card
    // is a debt to cover from the pockets that spent it, not cash that was never assignable, so it must not shrink Ready to assign.
    db.account.aggregate({
      where: {
        workspaceId,
        onBudget: true,
        type: { not: "CREDIT_CARD" },
        balanceMode: "TRANSACTION_DERIVED",
        OR: [{ openingBalanceDate: null }, { openingBalanceDate: { lt: periodEnd } }],
      },
      _sum: { openingBalanceCents: true },
    }),
    db.transaction.aggregate({
      where: { workspaceId, date: { lt: periodEnd }, ...POOL_INFLOW },
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
