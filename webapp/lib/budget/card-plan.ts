/**
 * Card payment plan. A card reports the balance it has on its statement closing date, and the bill you must pay by the due date is
 * that statement balance. So paying the card down a couple of days BEFORE it closes keeps the reported balance (credit use) low,
 * and the due date is the hard deadline for the rest.
 */
export const LEAD_DAYS = 2;           // pay this many days before the statement closes
export const TARGET_UTIL_BPS = 900;    // aim to report under 9% of the limit (30% is the common ceiling)
export const ALERT_DAYS = 5;           // start nagging this many days ahead

export interface PlanInput { owedCents: number; limitCents: number | null; closeIso: string | null; closeDays: number | null; dueIso: string | null; dueDays: number | null }
export interface CardPlan {
  /** Date to pay down by (the statement closes LEAD_DAYS after), and days until it. */
  payByIso: string | null; payByDays: number | null;
  /** How much to pay before the close to report at the target (everything owed when no limit is known). */
  payDownCents: number;
  /** What the reported balance would be after that payment, and as a share of the limit. */
  reportedCents: number; reportedPct: number | null;
  /** Show the "pay before it closes" reminder. */
  closeAlert: boolean;
  /** Show the "payment due" reminder. */
  dueAlert: boolean;
}

function minusDays(iso: string, n: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) - n));
  return d.toISOString().slice(0, 10);
}

export function planCard(i: PlanInput): CardPlan {
  const target = i.limitCents && i.limitCents > 0 ? Math.floor((i.limitCents * TARGET_UTIL_BPS) / 10_000) : 0;
  const payDown = Math.max(0, i.owedCents - target);
  const payByIso = i.closeIso ? minusDays(i.closeIso, LEAD_DAYS) : null;
  const payByDays = i.closeDays === null ? null : i.closeDays - LEAD_DAYS;
  const reported = i.owedCents - payDown;
  return {
    payByIso, payByDays,
    payDownCents: payDown,
    reportedCents: reported,
    reportedPct: i.limitCents && i.limitCents > 0 ? Math.round((reported / i.limitCents) * 1000) / 10 : null,
    closeAlert: payDown > 0 && payByDays !== null && payByDays <= ALERT_DAYS,
    dueAlert: i.owedCents > 0 && i.dueDays !== null && i.dueDays <= ALERT_DAYS,
  };
}
