/** What the budget's Loans panel shows for one loan. Client-safe. */
export interface LoanVM {
  accountId: string;
  name: string;
  /** False = the loan exists (net worth) but has no terms / pocket on the budget yet. */
  onBudget: boolean;
  paymentCents: number;
  numPayments: number | null;
  firstDueIso: string | null;
  aprBps: number;
  originalCents: number;
  paymentsDone: number;
  paymentsLeft: number;
  nextDueIso: string | null;
  lastDueIso: string | null;
  phase: "upcoming" | "active" | "finished" | "unset";
  remainingCents: number;
  /** This month's payment is paid (ticked or covered by spending). */
  paidThisMonth: boolean;
  overdue: boolean;
  groupId: string | null;
  paidFromId: string | null;
  /** Owed balance recorded on the loan account (net worth). */
  balanceOwedCents: number;
}
