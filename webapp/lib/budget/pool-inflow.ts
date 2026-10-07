import type { Prisma } from "@prisma/client";

/**
 * Which money-in entries feed the pool ("Ready to assign").
 *
 * Every inflow to an on-budget account is pool money, whether or not it has been given a category yet:
 *   - anything filed under an INCOME category, and
 *   - any other money in that has no pocket yet (not a transfer between your own accounts, not a split).
 *
 * Money in that is filed under a spending pocket (a refund, say) is deliberately NOT here: it lowers that
 * pocket's spending instead, so it never counts twice. Once an uncategorized inflow is given a spending
 * pocket it leaves the pool and becomes that pocket's activity; filing it under Income keeps it in the pool.
 *
 * Shared by getReadyToAssign (the total) and loadPools (the per-account split) so the two always agree.
 */
export const POOL_INFLOW: Prisma.TransactionWhereInput = {
  account: { onBudget: true },
  OR: [
    { category: { type: "INCOME" } },
    { categoryId: null, transferGroupId: null, amountCents: { gt: 0 }, splits: { none: {} } },
  ],
};
