/**
 * Loan math in integer cents. Client-safe (no database).
 * Interest accrues monthly at APR/12 on the running balance, rounded half up to the cent.
 * `aprBps` is the yearly rate in hundredths of a percent (6.25% = 625).
 */
export const MAX_MONTHS = 1200; // 100 years: beyond this we say "never"

const interestOn = (balance: number, aprBps: number) => Math.floor((balance * aprBps * 2 + 120000) / 240000); // round(balance*bps/120000)

export interface ScheduleRow { n: number; paymentCents: number; interestCents: number; principalCents: number; balanceCents: number }
export interface PayoffResult {
  /** True when the payment can't even cover the interest (or is zero) — the loan never ends. */
  never: boolean;
  months: number;
  totalInterestCents: number;
  totalPaidCents: number;
  schedule: ScheduleRow[];
}

export function amortize(o: { balanceCents: number; aprBps: number; paymentCents: number; extraMonthlyCents?: number; lumpSumCents?: number }): PayoffResult {
  let bal = Math.max(0, o.balanceCents - Math.max(0, o.lumpSumCents ?? 0));
  const lump = o.balanceCents - bal;
  const pay = Math.max(0, o.paymentCents) + Math.max(0, o.extraMonthlyCents ?? 0);
  const schedule: ScheduleRow[] = [];
  let totalInterest = 0, totalPaid = lump;
  if (bal === 0) return { never: false, months: 0, totalInterestCents: 0, totalPaidCents: totalPaid, schedule };
  if (pay <= interestOn(bal, o.aprBps) && pay < bal + interestOn(bal, o.aprBps)) return { never: true, months: 0, totalInterestCents: 0, totalPaidCents: 0, schedule };
  for (let n = 1; n <= MAX_MONTHS; n++) {
    const interest = interestOn(bal, o.aprBps);
    const p = Math.min(pay, bal + interest);
    const principal = p - interest;
    bal -= principal;
    totalInterest += interest; totalPaid += p;
    schedule.push({ n, paymentCents: p, interestCents: interest, principalCents: principal, balanceCents: bal });
    if (bal <= 0) return { never: false, months: n, totalInterestCents: totalInterest, totalPaidCents: totalPaid, schedule };
  }
  return { never: true, months: 0, totalInterestCents: 0, totalPaidCents: 0, schedule: [] };
}

/** "2026-10-04" + 3 months -> "2027-01" style month (year, 1-based month). */
export function monthAfter(todayIso: string, months: number): { year: number; month: number } {
  const y = +todayIso.slice(0, 4), m = +todayIso.slice(5, 7) - 1 + months;
  return { year: y + Math.floor(m / 12), month: ((m % 12) + 12) % 12 + 1 };
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthYearLabel = (todayIso: string, months: number) => { const { year, month } = monthAfter(todayIso, months); return `${MONTHS[month - 1]} ${year}`; };
export function durationLabel(months: number): string {
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} yr${y > 1 ? "s" : ""}` : "", m ? `${m} mo` : ""].filter(Boolean).join(" ") || "0 mo";
}

export interface Scenario { base: PayoffResult; plan: PayoffResult; monthsSaved: number; interestSavedCents: number }
export function compareScenarios(o: { balanceCents: number; aprBps: number; paymentCents: number; extraMonthlyCents: number; lumpSumCents: number }): Scenario {
  const base = amortize({ balanceCents: o.balanceCents, aprBps: o.aprBps, paymentCents: o.paymentCents });
  const plan = amortize(o);
  const ok = !base.never && !plan.never;
  return { base, plan, monthsSaved: ok ? base.months - plan.months : plan.never ? 0 : 0, interestSavedCents: ok ? base.totalInterestCents - plan.totalInterestCents : 0 };
}

/** The smallest monthly payment (whole cents) that clears the balance within `months`. */
export function paymentToPayoffIn(balanceCents: number, aprBps: number, months: number): number {
  if (balanceCents <= 0 || months <= 0) return 0;
  let lo = 1, hi = balanceCents + interestOn(balanceCents, aprBps); // one payment always clears it
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const r = amortize({ balanceCents, aprBps, paymentCents: mid });
    if (!r.never && r.months <= months) hi = mid; else lo = mid + 1;
  }
  return lo;
}

/** Yearly roll-up of a schedule for a compact table. */
export function yearlySummary(schedule: ScheduleRow[], todayIso: string) {
  const out = new Map<number, { year: number; paidCents: number; interestCents: number; principalCents: number; endBalanceCents: number }>();
  for (const r of schedule) {
    const { year } = monthAfter(todayIso, r.n);
    const y = out.get(year) ?? { year, paidCents: 0, interestCents: 0, principalCents: 0, endBalanceCents: 0 };
    y.paidCents += r.paymentCents; y.interestCents += r.interestCents; y.principalCents += r.principalCents; y.endBalanceCents = r.balanceCents;
    out.set(year, y);
  }
  return [...out.values()];
}

// ------------------------------------------------------------- debt planner
export interface Debt { id: string; name: string; balanceCents: number; aprBps: number; minPaymentCents: number }
export type Strategy = "AVALANCHE" | "SNOWBALL";
export interface DebtPlanResult {
  never: boolean;
  months: number;
  totalInterestCents: number;
  /** Month number each debt reaches zero (1 = next month). */
  payoffMonth: Record<string, number>;
  order: string[];
}

/**
 * Pay the minimum on every debt, then throw every spare dollar (the extra plus the payments freed up
 * by debts already cleared) at the target: highest rate first (avalanche) or smallest balance first (snowball).
 */
export function planDebts(debts: Debt[], extraCents: number, strategy: Strategy): DebtPlanResult {
  const live = debts.filter((d) => d.balanceCents > 0).map((d) => ({ ...d, bal: d.balanceCents }));
  const payoffMonth: Record<string, number> = {};
  const order: string[] = [];
  let totalInterest = 0;
  const priority = (a: (typeof live)[number], b: (typeof live)[number]) =>
    strategy === "AVALANCHE" ? b.aprBps - a.aprBps || a.bal - b.bal : a.bal - b.bal || b.aprBps - a.aprBps;
  const budget = live.reduce((s, d) => s + d.minPaymentCents, 0) + Math.max(0, extraCents);
  for (let n = 1; n <= MAX_MONTHS; n++) {
    const open = live.filter((d) => d.bal > 0);
    if (open.length === 0) return { never: false, months: n - 1, totalInterestCents: totalInterest, payoffMonth, order };
    for (const d of open) { const i = interestOn(d.bal, d.aprBps); d.bal += i; totalInterest += i; }
    let left = budget;
    // minimums first
    for (const d of open) { const p = Math.min(d.minPaymentCents, d.bal, left); d.bal -= p; left -= p; }
    // then the rest to the target(s) in priority order
    for (const d of [...open].sort(priority)) { if (left <= 0) break; const p = Math.min(d.bal, left); d.bal -= p; left -= p; }
    for (const d of open) if (d.bal <= 0 && payoffMonth[d.id] === undefined) { payoffMonth[d.id] = n; order.push(d.id); }
  }
  return { never: true, months: 0, totalInterestCents: 0, payoffMonth: {}, order: [] };
}
