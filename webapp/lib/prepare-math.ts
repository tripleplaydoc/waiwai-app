/**
 * "Prepare for more": what extra money would do to the plan, and where it should go. Pure, integer cents, no database.
 * An estimate for planning, not tax advice.
 */
export interface DebtIn { name: string; balanceCents: number; aprBps: number }
export interface PrepareInput {
  /** Extra money coming in each month, and an optional one-time amount. */
  extraMonthlyCents: number;
  lumpSumCents: number;
  /** Share of new income to set aside for tax, in basis points (0 when tax is already withheld). */
  taxSetAsideBps: number;
  /** Tax rate used to value tax-advantaged contributions (basis points). */
  marginalBps: number;
  monthlyCostCents: number;
  /** Still unassigned for this month's costs and goals. */
  unfundedCents: number;
  /** Money held in pockets today. */
  cushionHeldCents: number;
  cushionTargetMonths: number;
  debts: DebtIn[];
  hasTaxReservePocket: boolean;
  isBusiness: boolean;
}

export type StepKey = "tax" | "gaps" | "cushion" | "debt" | "advantaged" | "growth";
export interface PlanStep { key: StepKey; title: string; monthlyCents: number; lumpCents: number; why: string }
export type CheckState = "good" | "note";
export interface Check { key: string; state: CheckState; title: string; detail: string }
export interface PreparePlan {
  steps: PlanStep[];
  afterTaxMonthlyCents: number;
  afterTaxLumpCents: number;
  /** First-year view (12 months of the monthly amount plus the one-time amount). */
  yearTotals: { incomeCents: number; taxSetAsideCents: number; toGapsCents: number; toCushionCents: number; toDebtCents: number; toAdvantagedCents: number; toGrowthCents: number };
  /** Estimated yearly tax kept by using tax-advantaged contributions. */
  taxKeptCents: number;
  /** Estimated first-year interest avoided by paying debt down. */
  interestAvoidedCents: number;
  cushionMonthsNow: number | null;
  cushionMonthsAfter: number | null;
  checks: Check[];
}

const bps = (cents: number, b: number) => Math.round((cents * b) / 10000);
const clamp0 = (n: number) => Math.max(0, n);

/** Debts worth paying early: 8% a year or more, highest rate first. */
export const HIGH_INTEREST_BPS = 800;

function allocate(amount: number, caps: { debt: number; cushion: number }) {
  // Safety first (cushion and debt share 70%), the rest grows. Whatever safety cannot absorb overflows to growth.
  const safetyShare = Math.round(amount * 0.7);
  const wantCushion = caps.cushion, wantDebt = caps.debt;
  const wantTotal = wantCushion + wantDebt;
  let cushion = 0, debt = 0;
  if (wantTotal > 0) {
    const room = Math.min(safetyShare, wantTotal);
    cushion = Math.min(wantCushion, Math.round((room * wantCushion) / wantTotal));
    debt = Math.min(wantDebt, room - cushion);
    // If one cap bound, give the leftover safety room to the other.
    const left = room - cushion - debt;
    if (left > 0) { const addD = Math.min(left, wantDebt - debt); debt += addD; cushion += Math.min(left - addD, wantCushion - cushion); }
  }
  const rest = amount - cushion - debt;
  const advantaged = Math.round(rest * 0.6);
  return { cushion, debt, advantaged, growth: rest - advantaged };
}

export function planFor(i: PrepareInput): PreparePlan {
  const taxM = bps(i.extraMonthlyCents, i.taxSetAsideBps), taxL = bps(i.lumpSumCents, i.taxSetAsideBps);
  const netM = i.extraMonthlyCents - taxM, netL = i.lumpSumCents - taxL;

  // 1) Gaps in this month's plan are filled first, from the one-time amount, then from the monthly amount.
  const gapL = Math.min(netL, clamp0(i.unfundedCents));
  const gapM = Math.min(netM, clamp0(i.unfundedCents) - gapL);
  const remL = netL - gapL, remM = netM - gapM;

  // 2) Caps for the safety steps.
  const cushionTarget = Math.round(i.monthlyCostCents * i.cushionTargetMonths);
  const cushionGap = clamp0(cushionTarget - i.cushionHeldCents);
  const hi = i.debts.filter((d) => d.aprBps >= HIGH_INTEREST_BPS && d.balanceCents > 0).sort((a, b) => b.aprBps - a.aprBps);
  const debtTotal = hi.reduce((s, d) => s + d.balanceCents, 0);

  const lump = allocate(remL, { debt: debtTotal, cushion: cushionGap });
  // Run twelve months: each month fills the safety steps until their caps are met, then overflows to growth.
  let capDebt = debtTotal - lump.debt, capCushion = cushionGap - lump.cushion;
  const month = allocate(remM, { debt: capDebt, cushion: capCushion }); // what month one looks like
  let yearDebt = 0, yearCushion = 0, yearAdv = 0, yearGrowth = 0;
  for (let m = 0; m < 12; m++) {
    const a = allocate(remM, { debt: capDebt, cushion: capCushion });
    capDebt -= a.debt; capCushion -= a.cushion;
    yearDebt += a.debt; yearCushion += a.cushion; yearAdv += a.advantaged; yearGrowth += a.growth;
  }

  // Interest avoided in year one: payments applied to the highest-rate debts first (simple, ignores payoff timing).
  let toApply = lump.debt + yearDebt, interest = 0;
  for (const d of hi) { const pay = Math.min(toApply, d.balanceCents); interest += bps(pay, d.aprBps); toApply -= pay; }

  const advYear = lump.advantaged + yearAdv;
  const growthYear = lump.growth + yearGrowth;
  const taxKept = bps(advYear, i.marginalBps);

  const steps: PlanStep[] = [];
  if (taxM + taxL > 0) steps.push({ key: "tax", title: i.isBusiness ? "Estimated tax reserve" : "Set aside for taxes", monthlyCents: taxM, lumpCents: taxL, why: "Set aside first so it is never mistaken for spendable money." });
  if (gapM + gapL > 0) steps.push({ key: "gaps", title: "Fund what is still unfunded", monthlyCents: gapM, lumpCents: gapL, why: "Costs and goals already in your plan come before anything new." });
  if (month.cushion + lump.cushion > 0) steps.push({ key: "cushion", title: `Build your cushion to ${i.cushionTargetMonths} months`, monthlyCents: month.cushion, lumpCents: lump.cushion, why: "A cushion turns surprises into non-events." });
  if (month.debt + lump.debt > 0) steps.push({ key: "debt", title: hi[0] ? `Pay down ${hi[0].name} and other high-interest balances` : "Pay down high-interest balances", monthlyCents: month.debt, lumpCents: lump.debt, why: "Paying off a balance earns a guaranteed return equal to its interest rate, with no risk." });
  if (month.advantaged + lump.advantaged > 0) steps.push({ key: "advantaged", title: i.isBusiness ? "Retirement plan or HSA (tax-advantaged)" : "Retirement or HSA (tax-advantaged)", monthlyCents: month.advantaged, lumpCents: lump.advantaged, why: "Contributions can lower this year's taxable income, so less of every dollar leaks to tax." });
  if (month.growth + lump.growth > 0) steps.push({ key: "growth", title: "Invest and fund your goals", monthlyCents: month.growth, lumpCents: lump.growth, why: "What is left grows toward your bigger goals." });

  const monthsNow = i.monthlyCostCents > 0 ? i.cushionHeldCents / i.monthlyCostCents : null;
  const cushionAfter = i.cushionHeldCents + lump.cushion + yearCushion;
  const monthsAfter = i.monthlyCostCents > 0 ? cushionAfter / i.monthlyCostCents : null;

  const checks: Check[] = [];
  if (i.isBusiness) checks.push(i.hasTaxReservePocket
    ? { key: "taxpocket", state: "good", title: "Your tax reserve pocket is ready", detail: "New revenue already has a place to set tax money aside." }
    : { key: "taxpocket", state: "note", title: "Add an estimated tax reserve pocket", detail: "Without one, tax money mixes with spendable money." });
  checks.push(i.unfundedCents > 0
    ? { key: "gaps", state: "note", title: `${money(i.unfundedCents)} of your plan is not funded yet`, detail: "New money covers that first, so your current plan gets steadier right away." }
    : { key: "gaps", state: "good", title: "Everything in your plan is funded", detail: "All new money is free to work on growth." });
  checks.push(monthsNow !== null && monthsNow < i.cushionTargetMonths
    ? { key: "cushion", state: "note", title: `Your cushion covers about ${monthsNow.toFixed(1)} months`, detail: `A target of ${i.cushionTargetMonths} months is the next milestone.` }
    : { key: "cushion", state: "good", title: monthsNow === null ? "Add monthly costs to measure your cushion" : `Your cushion covers about ${monthsNow.toFixed(1)} months`, detail: monthsNow === null ? "Costs on your pockets let this check work." : "That already meets the target." });
  checks.push(hi.length > 0
    ? { key: "debt", state: "note", title: `${money(debtTotal)} of balances cost ${(hi[0].aprBps / 100).toFixed(0)}%+ a year`, detail: "Paying these early is the safest return available." }
    : { key: "debt", state: "good", title: "No high-interest balances", detail: "Nothing is quietly draining interest." });

  return {
    steps, afterTaxMonthlyCents: netM, afterTaxLumpCents: netL,
    yearTotals: { incomeCents: i.extraMonthlyCents * 12 + i.lumpSumCents, taxSetAsideCents: taxM * 12 + taxL, toGapsCents: gapM + gapL, toCushionCents: yearCushion + lump.cushion, toDebtCents: yearDebt + lump.debt, toAdvantagedCents: advYear, toGrowthCents: growthYear },
    taxKeptCents: taxKept, interestAvoidedCents: interest, cushionMonthsNow: monthsNow, cushionMonthsAfter: monthsAfter, checks,
  };
}

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
