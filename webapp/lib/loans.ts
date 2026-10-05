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

// ------------------------------------------------------- loans on the budget
const ym = (iso: string) => iso.slice(0, 7);
const daysIn = (year: number, month1: number) => new Date(Date.UTC(year, month1, 0)).getUTCDate();

/** Due date of payment `i` (0 = first). Same day of the month as the first payment, clamped to short months. */
export function loanDueIso(firstIso: string, i: number): string {
  const day = +firstIso.slice(8, 10);
  const { year, month } = monthAfter(firstIso, i);
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, daysIn(year, month))).padStart(2, "0")}`;
}

export interface LoanTerms { paymentCents: number; numPayments: number; firstDueIso: string; aprBps: number; originalCents: number }
export interface LoanStatus {
  /** Payments finished so far: every payment due in an earlier month, plus this month's if it is paid. */
  paymentsDone: number;
  paymentsLeft: number;
  /** 1-based number of the payment due in the viewed month (null when none falls in it). */
  thisMonthNumber: number | null;
  /** Next unpaid payment's date (null when finished). */
  nextDueIso: string | null;
  lastDueIso: string;
  /** "upcoming" = first payment is in a later month, "active", or "finished" (last payment's month has passed or it is paid). */
  phase: "upcoming" | "active" | "finished";
  /** What is left to pay: payments left × the payment. */
  remainingCents: number;
}

/** Where a loan stands in `todayIso`'s month. `thisMonthPaid` = that month's payment is marked paid or covered by spending. */
export function loanStatus(t: LoanTerms, todayIso: string, thisMonthPaid: boolean): LoanStatus {
  const n = Math.max(0, Math.floor(t.numPayments));
  const lastDueIso = loanDueIso(t.firstDueIso, Math.max(0, n - 1));
  const month = ym(todayIso);
  let before = 0, thisIdx = -1;
  for (let i = 0; i < n; i++) {
    const m = ym(loanDueIso(t.firstDueIso, i));
    if (m < month) before++;
    else if (m === month) thisIdx = i;
    else break;
  }
  const done = Math.min(n, before + (thisIdx >= 0 && thisMonthPaid ? 1 : 0));
  const left = n - done;
  const phase: LoanStatus["phase"] = left === 0 ? "finished" : ym(t.firstDueIso) > month ? "upcoming" : "active";
  const nextIdx = thisIdx >= 0 && !thisMonthPaid ? thisIdx : Math.max(before + (thisIdx >= 0 ? 1 : 0), done);
  return {
    paymentsDone: done, paymentsLeft: left, thisMonthNumber: thisIdx >= 0 ? thisIdx + 1 : null,
    nextDueIso: left === 0 ? null : loanDueIso(t.firstDueIso, Math.min(n - 1, nextIdx)),
    lastDueIso, phase, remainingCents: left * Math.max(0, t.paymentCents),
  };
}

/** How many payments clear `balanceCents` at `paymentCents` a month (0% = balance ÷ payment, rounded up). null = the payment never clears it. */
export function paymentsFor(balanceCents: number, paymentCents: number, aprBps: number): number | null {
  if (balanceCents <= 0) return 0;
  if (paymentCents <= 0) return null;
  if (aprBps <= 0) return Math.ceil(balanceCents / paymentCents);
  const r = amortize({ balanceCents, aprBps, paymentCents });
  return r.never ? null : r.months;
}

/** Estimated balance after `paid` payments (interest-free when the rate is 0). */
export function balanceAfter(t: LoanTerms, paid: number): number {
  const p = Math.max(0, Math.min(t.numPayments, paid));
  if (t.aprBps <= 0) return Math.max(0, t.originalCents - p * t.paymentCents);
  const r = amortize({ balanceCents: t.originalCents, aprBps: t.aprBps, paymentCents: t.paymentCents });
  return p === 0 ? t.originalCents : r.schedule[p - 1]?.balanceCents ?? 0;
}

/** The payment (rounded up to the cent) that clears `originalCents` in `numPayments` at `aprBps`; 0% = even split. */
export function suggestPayment(originalCents: number, numPayments: number, aprBps: number): number {
  if (originalCents <= 0 || numPayments <= 0) return 0;
  if (aprBps <= 0) return Math.ceil(originalCents / numPayments);
  return paymentToPayoffIn(originalCents, aprBps, numPayments);
}
