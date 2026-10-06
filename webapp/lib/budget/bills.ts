/**
 * Due dates and paid status for bills/expenses. Pure functions (dates are
 * plain "YYYY-MM-DD" strings, so there is no time-zone drift).
 */
export type BillState = "paid" | "overdue" | "due_soon" | "upcoming";

export interface BillInput {
  dueDay: number | null;
  monthIso: string; // "2026-10"
  todayIso: string; // "2026-10-03"
  manualPaid: boolean;
  /** Money spent from this pocket this month, as a positive number. */
  spentCents: number;
  targetCents: number | null;
}

export interface BillStatus {
  state: BillState;
  dueIso: string;
  /** Days from today to the due date (negative = past due). */
  daysUntil: number;
  /** True when paid because enough spending was recorded, not because it was ticked. */
  autoPaid: boolean;
}

export const DUE_SOON_DAYS = 7;

export function daysInMonth(monthIso: string): number {
  const [y, m] = monthIso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Due day clamped to the month's length: day 31 in September -> the 30th. */
export function dueDateFor(monthIso: string, dueDay: number): string {
  const day = Math.min(Math.max(1, Math.trunc(dueDay)), daysInMonth(monthIso));
  return `${monthIso}-${String(day).padStart(2, "0")}`;
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function billStatus(i: BillInput): BillStatus | null {
  if (i.dueDay === null || i.dueDay < 1) return null;
  const dueIso = dueDateFor(i.monthIso, i.dueDay);
  const daysUntil = dayNumber(dueIso) - dayNumber(i.todayIso);
  const autoPaid = i.spentCents > 0 && (i.targetCents === null || i.targetCents <= 0 || i.spentCents >= i.targetCents);
  let state: BillState;
  if (i.manualPaid || autoPaid) state = "paid";
  else if (daysUntil < 0) state = "overdue";
  else if (daysUntil <= DUE_SOON_DAYS) state = "due_soon";
  else state = "upcoming";
  return { state, dueIso, daysUntil, autoPaid: autoPaid && !i.manualPaid };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function describeBill(b: BillStatus): string {
  switch (b.state) {
    case "paid": return b.autoPaid ? "Paid" : "Marked paid";
    case "overdue": return "Waiting for you";
    case "due_soon":
      if (b.daysUntil === 0) return "Due today";
      if (b.daysUntil === 1) return "Due tomorrow";
      return `Due in ${b.daysUntil} days`;
    default: return `Due ${shortDate(b.dueIso)}`;
  }
}
