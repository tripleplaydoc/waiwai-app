import { monthsBetweenInclusive } from "./dates";

/**
 * Pure budget math for the pocket progress bars, "can I cover it" check and
 * "months ahead" runway. All money is integer cents. No database access, so
 * it can be unit-tested directly.
 */
export type TargetType = "MONTHLY_FUNDING" | "TARGET_BALANCE" | "TARGET_BALANCE_BY_DATE";

export interface PocketInput {
  assignedCents: number; // assigned this month
  activityCents: number; // spending (negative) this month
  availableCents: number; // rolling balance through the end of this month
  targetType: TargetType | null;
  targetCents: number | null;
  targetDate: Date | null;
  /** Ticked "paid" for this month. A paid monthly cost has nothing left to fund this month. */
  manualPaid?: boolean;
  /** Monthly costs: extra months of the cost to keep on hand beyond this month (0/undefined = this month only). */
  monthsAhead?: number;
}

export type PocketState = "none" | "overspent" | "funded" | "partial" | "empty";

export interface PocketProgress {
  hasTarget: boolean;
  targetType: TargetType | null;
  targetCents: number;
  /** What the target says should be assigned this month. */
  needThisMonthCents: number;
  /** How much more must be assigned this month to meet that. */
  stillNeededCents: number;
  /** 0..1 bar fill. Monthly costs: funded this month. Goals: balance toward the goal. */
  progress: number;
  state: PocketState;
  /** Goals with a date: whole months left including this one. */
  monthsLeft: number | null;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function pocketProgress(p: PocketInput, month: Date): PocketProgress {
  const none: PocketProgress = {
    hasTarget: false, targetType: null, targetCents: 0, needThisMonthCents: 0,
    stillNeededCents: 0, progress: 0, state: p.availableCents < 0 ? "overspent" : "none", monthsLeft: null,
  };
  if (!p.targetType || !p.targetCents || p.targetCents <= 0) return none;

  const target = p.targetCents;
  const startBalance = p.availableCents - p.assignedCents - p.activityCents; // balance at end of last month
  let need: number;
  let still: number;
  let progress: number;
  let monthsLeft: number | null = null;

  switch (p.targetType) {
    case "MONTHLY_FUNDING":
      need = target;
      // Paid (ticked, or enough spending recorded) means this month's cost is done, whatever was assigned.
      const spent = Math.max(0, -p.activityCents);
      const paid = p.manualPaid === true || (spent > 0 && spent >= target);
      const ahead = Math.max(0, Math.floor(p.monthsAhead ?? 0));
      if (ahead > 0) {
        // Keep a cushion: this month's cost (until it is paid) plus `ahead` more months, measured on the balance.
        const goal = target * (paid ? ahead : 1 + ahead);
        still = Math.max(0, goal - p.availableCents);
        progress = clamp01(p.availableCents / goal);
        need = p.assignedCents + still;
      } else {
        still = paid ? 0 : Math.max(0, target - p.assignedCents);
        progress = paid ? 1 : clamp01(p.assignedCents / target);
      }
      break;
    case "TARGET_BALANCE":
      still = Math.max(0, target - p.availableCents);
      need = p.assignedCents + still;
      progress = clamp01(p.availableCents / target);
      break;
    case "TARGET_BALANCE_BY_DATE": {
      monthsLeft = p.targetDate ? monthsBetweenInclusive(month, p.targetDate) : 1;
      const gap = Math.max(0, target - startBalance);
      need = Math.ceil(gap / monthsLeft);
      still = Math.max(0, need - p.assignedCents);
      progress = clamp01(p.availableCents / target);
      break;
    }
  }

  let state: PocketState;
  if (p.availableCents < 0) state = "overspent";
  else if (still === 0) state = "funded";
  else if (progress > 0 || p.assignedCents > 0) state = "partial";
  else state = "empty";

  return {
    hasTarget: true, targetType: p.targetType, targetCents: target,
    needThisMonthCents: need, stillNeededCents: still, progress, state, monthsLeft,
  };
}

export interface BudgetHealth {
  /** Sum of the monthly cost targets you've entered. */
  monthlyCostCents: number;
  /** Extra needed each month to stay on pace for dated goals. */
  goalPaceCents: number;
  /** Total still to assign this month to meet every target. */
  stillNeededCents: number;
  canCover: boolean;
  /** How much Ready to Assign falls short of stillNeeded (0 when covered). */
  shortfallCents: number;
  /** Positive money sitting in pockets. */
  pocketMoneyCents: number;
  /** pocketMoney / monthlyCost, or null when no monthly costs are set. */
  monthsAhead: number | null;
  /** Same, counting Ready to Assign as well. */
  monthsAheadWithRta: number | null;
}

export function budgetHealth(
  pockets: { input: PocketInput; progress: PocketProgress }[],
  readyToAssignCents: number
): BudgetHealth {
  let monthlyCost = 0, goalPace = 0, still = 0, money = 0;
  for (const { input, progress } of pockets) {
    money += Math.max(0, input.availableCents);
    still += progress.stillNeededCents;
    if (progress.targetType === "MONTHLY_FUNDING") monthlyCost += progress.targetCents;
    if (progress.targetType === "TARGET_BALANCE_BY_DATE") goalPace += progress.needThisMonthCents;
  }
  const rta = Math.max(0, readyToAssignCents);
  return {
    monthlyCostCents: monthlyCost,
    goalPaceCents: goalPace,
    stillNeededCents: still,
    canCover: rta >= still,
    shortfallCents: Math.max(0, still - rta),
    pocketMoneyCents: money,
    monthsAhead: monthlyCost > 0 ? money / monthlyCost : null,
    monthsAheadWithRta: monthlyCost > 0 ? (money + rta) / monthlyCost : null,
  };
}

/** 2.4 -> "2 months, 12 days"; 0.5 -> "15 days"; 1 -> "1 month". */
export function describeMonths(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "0 days";
  const whole = Math.floor(m + 1e-9);
  const days = Math.round((m - whole) * 30);
  const parts: string[] = [];
  if (whole > 0) parts.push(`${whole} month${whole === 1 ? "" : "s"}`);
  if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  return parts.join(", ") || "0 days";
}
