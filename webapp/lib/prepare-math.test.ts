import assert from "node:assert/strict";
import { planFor, type PrepareInput } from "./prepare-math";

const base: PrepareInput = { extraMonthlyCents: 0, lumpSumCents: 0, taxSetAsideBps: 3000, marginalBps: 3000, monthlyCostCents: 400000, unfundedCents: 0, cushionHeldCents: 400000, cushionTargetMonths: 3, debts: [], hasTaxReservePocket: true, isBusiness: true };
const sum = (p: ReturnType<typeof planFor>) => p.steps.reduce((s, x) => s + x.monthlyCents, 0);

// Nothing extra, nothing to do.
assert.equal(planFor(base).steps.length, 0);

// $2,000 a month, business, 30% tax: $600 reserve, $1,400 to work with; every dollar is placed.
let p = planFor({ ...base, extraMonthlyCents: 200000 });
assert.equal(p.afterTaxMonthlyCents, 140000);
assert.equal(p.steps[0].key, "tax"); assert.equal(p.steps[0].monthlyCents, 60000);
assert.equal(sum(p), 200000);
// Cushion gap = 3*4000 - 4000 = 8000 dollars; 70% of 1400 goes to safety, the rest 60/40 to advantaged/growth.
const cushion = p.steps.find((s) => s.key === "cushion")!; assert.equal(cushion.monthlyCents, 98000);
assert.equal(p.steps.find((s) => s.key === "advantaged")!.monthlyCents + p.steps.find((s) => s.key === "growth")!.monthlyCents, 42000);
assert.ok(p.taxKeptCents > 0);

// Unfunded plan is filled before anything else; the one-time amount goes first.
p = planFor({ ...base, lumpSumCents: 300000, unfundedCents: 100000, taxSetAsideBps: 0 });
assert.equal(p.steps.find((s) => s.key === "gaps")!.lumpCents, 100000);
assert.equal(p.steps.reduce((s, x) => s + x.lumpCents, 0), 300000);

// High-interest debt is paid, low-interest is ignored, and interest avoided is estimated.
p = planFor({ ...base, extraMonthlyCents: 100000, taxSetAsideBps: 0, cushionHeldCents: 1200000, debts: [{ name: "Chase", balanceCents: 500000, aprBps: 2400 }, { name: "Car", balanceCents: 900000, aprBps: 400 }] });
assert.equal(p.steps.find((s) => s.key === "cushion"), undefined);
assert.equal(p.steps.find((s) => s.key === "debt")!.monthlyCents, 70000);
assert.ok(p.interestAvoidedCents > 0 && p.interestAvoidedCents <= 120000);
assert.equal(p.checks.find((c) => c.key === "debt")!.state, "note");

// Over a year, debt payments never exceed the balance and the money still adds up.
p = planFor({ ...base, extraMonthlyCents: 500000, taxSetAsideBps: 0, cushionHeldCents: 1200000, debts: [{ name: "Card", balanceCents: 300000, aprBps: 2000 }] });
const t = p.yearTotals;
assert.equal(t.toDebtCents, 300000);
assert.equal(t.toGapsCents + t.toCushionCents + t.toDebtCents + t.toAdvantagedCents + t.toGrowthCents + t.taxSetAsideCents, t.incomeCents);

// Personal, taxes already withheld: no tax step.
p = planFor({ ...base, isBusiness: false, taxSetAsideBps: 0, extraMonthlyCents: 100000 });
assert.equal(p.steps.find((s) => s.key === "tax"), undefined);
console.log("prepare-math ok");
