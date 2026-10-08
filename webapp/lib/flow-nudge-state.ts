import "server-only";
import { prisma } from "@/lib/prisma";
import { POOL_INFLOW } from "@/lib/budget/pool-inflow";
import { dateToIso } from "@/lib/utils/dates";
import { flowNudge, type FlowNudge, type PoolDeposit } from "@/lib/flow-nudge";

/** Money that came into the Pool (same rule as Ready to assign), newest first, plus starting balances. */
export async function loadPoolDeposits(workspaceId: string): Promise<PoolDeposit[]> {
  const [tx, accounts] = await Promise.all([
    prisma.transaction.findMany({
      where: { workspaceId, amountCents: { gt: 0 }, ...POOL_INFLOW },
      orderBy: { date: "desc" }, take: 2000, select: { date: true, amountCents: true },
    }),
    prisma.account.findMany({
      where: { workspaceId, onBudget: true, type: { not: "CREDIT_CARD" }, balanceMode: "TRANSACTION_DERIVED", openingBalanceCents: { gt: 0 } },
      select: { openingBalanceCents: true, openingBalanceDate: true, createdAt: true },
    }),
  ]);
  return [
    ...tx.map((t) => ({ date: dateToIso(t.date), cents: t.amountCents })),
    ...accounts.map((a) => ({ date: dateToIso(a.openingBalanceDate ?? a.createdAt), cents: a.openingBalanceCents })),
  ];
}

export async function loadFlowNudge(workspaceId: string, poolCents: number, today: string): Promise<FlowNudge | null> {
  if (poolCents <= 0) return null;
  return flowNudge({ deposits: await loadPoolDeposits(workspaceId), poolCents, today });
}
