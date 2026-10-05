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
  /** Name of the budget pocket that pays this loan. */
  pocketName: string | null;
  /** The asset this loan is secured by (car, home…), with its latest value. */
  securedBy: { id: string; name: string; valueCents: number } | null;
}

/** A pocket already on the budget that can be used to pay a loan. */
export interface PocketChoice { id: string; name: string; group: string }

/** An asset a loan can be tied to. */
export interface AssetChoice { id: string; name: string; /** Name of another loan it is already tied to, if any. */ otherLoan: string | null }
