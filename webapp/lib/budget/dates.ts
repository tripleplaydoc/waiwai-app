/**
 * Month-alignment helpers for the envelope engine. Every "month" the budget
 * engine works with is normalized to midnight UTC on the 1st, matching the
 * `@db.Date` columns (BudgetAssignment.month, WaterfallRun.month, etc.).
 * Using UTC throughout avoids the classic bug where a server in one time
 * zone and a `@db.Date` column disagree about which month "now" falls in.
 */

export function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addMonthsUTC(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

/**
 * Number of whole months from `from` to `to`, inclusive of both endpoints,
 * clamped to a minimum of 1. Used to spread a TARGET_BALANCE_BY_DATE goal's
 * remaining gap evenly across the months left — including when `to` has
 * already passed, in which case this returns 1 ("fund the whole gap now")
 * rather than a negative or zero divisor.
 */
export function monthsBetweenInclusive(from: Date, to: Date): number {
  const fromStart = startOfMonthUTC(from);
  const toStart = startOfMonthUTC(to);
  const months =
    (toStart.getUTCFullYear() - fromStart.getUTCFullYear()) * 12 +
    (toStart.getUTCMonth() - fromStart.getUTCMonth());
  return Math.max(1, months + 1);
}
