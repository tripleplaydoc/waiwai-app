import type { PocketProgress } from "./targets";
import type { BillStatus } from "./bills";

export interface PocketVM {
  id: string;
  name: string;
  groupId: string | null;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
  isSystemManaged: boolean;
  isTaxDeductible: boolean;
  priorityRank: number | null;
  targetType: "MONTHLY_FUNDING" | "TARGET_BALANCE" | "TARGET_BALANCE_BY_DATE" | null;
  targetCents: number | null;
  targetDate: string | null;
  allocationBps: number | null;
  dueDay: number | null;
  manualPaid: boolean;
  kind: "INCOME" | "EXPENSE" | "SYSTEM";
  expenseType: string | null;
  bill: BillStatus | null;
  progress: PocketProgress;
}

export interface GroupVM {
  id: string; // real group id, or "__none" for pockets without a category
  name: string;
  allocationBps: number | null;
  pockets: PocketVM[];
}
