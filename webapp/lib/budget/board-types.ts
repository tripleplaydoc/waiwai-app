import type { PocketProgress } from "./targets";
import type { BillStatus } from "./bills";

/** The asset a pocket feeds: its own current value, and the value you want it to reach. */
export interface AssetVM {
  accountId: string;
  name: string;
  valueCents: number;
  goalCents: number | null;
  /** Date of the valuation the value comes from (YYYY-MM-DD), or null if it has never been valued. */
  asOfIso: string | null;
}

/** An asset a pocket could be tied to; takenBy is the pocket that already feeds it (an asset has one pocket). */
export interface AssetOption { id: string; name: string; takenBy: string | null }

export interface PocketVM {
  id: string;
  name: string;
  groupId: string | null;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
  isSystemManaged: boolean;
  isTaxDeductible: boolean;
  spendable: boolean;
  /** Saved for the next generation. */
  legacy: boolean;
  priorityRank: number | null;
  targetType: "MONTHLY_FUNDING" | "TARGET_BALANCE" | "TARGET_BALANCE_BY_DATE" | null;
  targetCents: number | null;
  targetDate: string | null;
  allocationBps: number | null;
  dueDay: number | null;
  /** Bank account this pocket is usually paid from. */
  paidFromId: string | null;
  /** Monthly costs: extra months of the cost kept on hand beyond this month. */
  monthsAhead: number;
  manualPaid: boolean;
  kind: "INCOME" | "EXPENSE" | "SYSTEM";
  expenseType: string | null;
  incomeKind: "EARNED" | "PORTFOLIO" | "PASSIVE" | null;
  bill: BillStatus | null;
  progress: PocketProgress;
  /** What still needs assigning to cover this month and next month too. */
  aheadNeedCents: number;
  /** Ids of the tags on this pocket. */
  tagIds: string[];
  /** Set when this pocket feeds an asset: the board then also shows the asset's own progress bar. */
  asset: AssetVM | null;
}

export interface GroupVM {
  id: string; // real group id, or "__none" for pockets without a category
  name: string;
  allocationBps: number | null;
  pockets: PocketVM[];
}
