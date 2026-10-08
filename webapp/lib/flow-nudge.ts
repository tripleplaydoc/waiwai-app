/**
 * "Let it flow": a gentle nudge when money has been resting in the Pool without a job. Pure, integer cents.
 *
 * The Pool is one running balance, so we ask: which money is it made of? We assume first in, first out, meaning the
 * oldest money is given jobs first, so what is left in the Pool is the newest money. Walking back from the newest
 * deposit, we count how much of the Pool came from deposits at least `minDays` old. That is the part that has been
 * resting, and the oldest deposit in that part says for how long.
 *
 * Example: Pool $900 = a $600 deposit 10 days ago + $300 deposited yesterday  =>  $600 resting for 10 days.
 */
import { daysBetween } from "@/lib/forecast-math";

export interface PoolDeposit { date: string; cents: number }
export interface FlowNudge { cents: number; days: number }

export const NUDGE_MIN_DAYS = 7;
/** Under $5 is not worth a note. */
export const NUDGE_MIN_CENTS = 500;
/** How long "Maybe later" quiets the card. */
export const NUDGE_SNOOZE_DAYS = 3;

export function flowNudge(opts: { deposits: PoolDeposit[]; poolCents: number; today: string; minDays?: number; minCents?: number }): FlowNudge | null {
  const minDays = opts.minDays ?? NUDGE_MIN_DAYS, minCents = opts.minCents ?? NUDGE_MIN_CENTS;
  let left = Math.floor(opts.poolCents);
  if (left <= 0) return null;
  const newestFirst = opts.deposits.filter((d) => d.cents > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date <= opts.today).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  let resting = 0, oldestAge = 0;
  for (const d of newestFirst) {
    if (left <= 0) break;
    const take = Math.min(left, d.cents);
    left -= take;
    const age = daysBetween(d.date, opts.today);
    if (age >= minDays) { resting += take; oldestAge = Math.max(oldestAge, age); }
  }
  return resting >= minCents ? { cents: resting, days: oldestAge } : null;
}

/** Cookie value that means "snoozed": the first day the card may show again (YYYY-MM-DD). */
export function snoozeUntil(today: string, days = NUDGE_SNOOZE_DAYS): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function isSnoozed(cookieValue: string | undefined, today: string): boolean {
  return !!cookieValue && /^\d{4}-\d{2}-\d{2}$/.test(cookieValue) && today < cookieValue;
}

/** "1 day" / "12 days" */
export function dayWord(n: number): string { return `${n} day${n === 1 ? "" : "s"}`; }
