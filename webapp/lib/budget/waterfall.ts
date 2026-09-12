import { AssignmentSource, FundingTargetType, type Category, type PrismaClient } from "@prisma/client";
import { addMonthsUTC, monthsBetweenInclusive, startOfMonthUTC } from "./dates";
import { getCategoryAssignedForMonth, getCategoryAvailableBalance } from "./category-balance";
import { getReadyToAssign } from "./ready-to-assign";

export interface WaterfallBucketResult {
  categoryId: string;
  categoryName: string;
  priorityRank: number;
  /** What this category needs assigned this month, per its target type. */
  requiredThisMonth: number;
  /** What was already assigned to it this month before this run. */
  alreadyAssignedThisMonth: number;
  /** requiredThisMonth − alreadyAssignedThisMonth, floored at 0. */
  shortfallCents: number;
  /** What this run actually gave it (may be less than shortfall if the pool ran out). */
  fundedCents: number;
  fullyFunded: boolean;
}

export interface WaterfallRunResult {
  waterfallRunId: string;
  month: Date;
  totalAmountCents: number;
  remainderCents: number;
  buckets: WaterfallBucketResult[];
}

/**
 * Computes what a single priority-ranked category needs assigned this
 * month, per its FundingTargetType. Read-only — does not write anything.
 * Categories with a priorityRank but no funding target set return a $0
 * requirement: they're ranked for future use but nothing to auto-fund yet.
 */
async function computeShortfall(
  db: PrismaClient,
  category: Category,
  month: Date
): Promise<{ requiredThisMonth: number; alreadyAssignedThisMonth: number; shortfallCents: number }> {
  const alreadyAssignedThisMonth = await getCategoryAssignedForMonth(db, category.id, month);

  if (!category.fundingTargetType || category.fundingTargetCents == null) {
    return { requiredThisMonth: 0, alreadyAssignedThisMonth, shortfallCents: 0 };
  }

  switch (category.fundingTargetType) {
    case FundingTargetType.MONTHLY_FUNDING: {
      // Needs this amount freshly assigned every month, independent of
      // whatever's left over from prior months (e.g. Rent).
      const requiredThisMonth = category.fundingTargetCents;
      const shortfallCents = Math.max(0, requiredThisMonth - alreadyAssignedThisMonth);
      return { requiredThisMonth, alreadyAssignedThisMonth, shortfallCents };
    }

    case FundingTargetType.TARGET_BALANCE: {
      // Needs to reach and hold this balance (e.g. emergency fund). Fund
      // the gap between the current rolling balance — which already
      // reflects anything assigned earlier this month — and the target.
      const currentBalance = await getCategoryAvailableBalance(db, category.id, month);
      const shortfallCents = Math.max(0, category.fundingTargetCents - currentBalance);
      return { requiredThisMonth: category.fundingTargetCents, alreadyAssignedThisMonth, shortfallCents };
    }

    case FundingTargetType.TARGET_BALANCE_BY_DATE: {
      // Back-calculate an even monthly contribution across the months
      // remaining until the target date (same approach as YNAB's "target
      // balance by date" goal type). Uses the balance as of the END of the
      // PRIOR month as the starting line, so the gap doesn't shrink just
      // because part of this month's contribution already landed —
      // shortfall then compares the even-pace requirement against what's
      // actually been assigned this month so far.
      const priorMonth = addMonthsUTC(month, -1);
      const balanceBeforeThisMonth = await getCategoryAvailableBalance(db, category.id, priorMonth);
      const totalGap = Math.max(0, category.fundingTargetCents - balanceBeforeThisMonth);
      const monthsRemaining = category.fundingTargetByDate
        ? monthsBetweenInclusive(month, category.fundingTargetByDate)
        : 1;
      const requiredThisMonth = Math.ceil(totalGap / monthsRemaining);
      const shortfallCents = Math.max(0, requiredThisMonth - alreadyAssignedThisMonth);
      return { requiredThisMonth, alreadyAssignedThisMonth, shortfallCents };
    }

    default: {
      // Exhaustiveness guard — if a new FundingTargetType is ever added to
      // the schema without updating this switch, fail loudly at run time
      // rather than silently funding $0.
      const _exhaustive: never = category.fundingTargetType;
      throw new Error(`Unhandled FundingTargetType: ${_exhaustive}`);
    }
  }
}

/**
 * Runs one priority-waterfall auto-assign pass for a workspace/month.
 *
 * Ranked categories (priorityRank set) are funded in ascending rank order,
 * each up to its computed shortfall, until the Ready-to-Assign pool is
 * exhausted or every ranked category is satisfied. Categories without a
 * priorityRank are untouched — they stay manual-assignment-only.
 *
 * Shortfalls for every ranked category are computed FIRST (pass 1), then
 * the pool is allocated down the priority order (pass 2) — this way every
 * category's bucket result (including ones the pool never reached) reflects
 * what it actually needed, which is what the "where do we need to focus"
 * visualization depends on.
 *
 * Writes one WaterfallRun row plus one BudgetAssignment row per category
 * that received money, all inside a single transaction — a run is
 * all-or-nothing. Throws if no category in the workspace has a
 * priorityRank set, since there'd be nothing for the waterfall to do.
 */
export async function runWaterfallAutoAssign(
  db: PrismaClient,
  workspaceId: string,
  month: Date
): Promise<WaterfallRunResult> {
  const monthStart = startOfMonthUTC(month);

  const rankedCategories = await db.category.findMany({
    where: { workspaceId, isArchived: false, priorityRank: { not: null } },
    orderBy: [{ priorityRank: "asc" }, { name: "asc" }], // stable tie-break for equal ranks
  });

  if (rankedCategories.length === 0) {
    throw new Error(
      "No categories have a priorityRank set for this workspace — nothing for the waterfall to fund."
    );
  }

  const pool = Math.max(0, await getReadyToAssign(db, workspaceId, monthStart));

  // Pass 1: compute what every ranked category needs, independent of pool size.
  const shortfalls = await Promise.all(
    rankedCategories.map(async (category) => ({
      category,
      ...(await computeShortfall(db, category, monthStart)),
    }))
  );

  // Pass 2: allocate the pool down the priority order.
  let remaining = pool;
  const buckets: WaterfallBucketResult[] = [];
  const toCreate: { categoryId: string; amountCents: number }[] = [];

  for (const { category, requiredThisMonth, alreadyAssignedThisMonth, shortfallCents } of shortfalls) {
    const fundedCents = Math.min(shortfallCents, remaining);
    if (fundedCents > 0) {
      toCreate.push({ categoryId: category.id, amountCents: fundedCents });
      remaining -= fundedCents;
    }
    buckets.push({
      categoryId: category.id,
      categoryName: category.name,
      priorityRank: category.priorityRank as number, // non-null: filtered in the query above
      requiredThisMonth,
      alreadyAssignedThisMonth,
      shortfallCents,
      fundedCents,
      fullyFunded: fundedCents >= shortfallCents,
    });
  }

  const run = await db.$transaction(async (trx) => {
    const created = await trx.waterfallRun.create({
      data: {
        workspaceId,
        month: monthStart,
        totalAmountCents: pool,
        remainderCents: remaining,
      },
    });

    if (toCreate.length > 0) {
      await trx.budgetAssignment.createMany({
        data: toCreate.map((item) => ({
          categoryId: item.categoryId,
          month: monthStart,
          amountCents: item.amountCents,
          source: AssignmentSource.AUTO_WATERFALL,
          waterfallRunId: created.id,
        })),
      });
    }

    return created;
  });

  return {
    waterfallRunId: run.id,
    month: monthStart,
    totalAmountCents: pool,
    remainderCents: remaining,
    buckets,
  };
}
