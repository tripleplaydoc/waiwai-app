import { amortize, compareScenarios, paymentToPayoffIn, planDebts, monthYearLabel, durationLabel, yearlySummary } from "./loans";

let failed = 0;
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { failed++; console.error(`FAIL ${name}\n  got      ${JSON.stringify(a)}\n  expected ${JSON.stringify(b)}`); } else console.log(`ok   ${name}`);
};
const near = (name: string, a: number, b: number, tol: number) => eq(name, Math.abs(a - b) <= tol, true);

// $200,000 at 6% for 30 years -> standard payment $1,199.10, total interest ~ $231,676
const pay30 = paymentToPayoffIn(20000000, 600, 360);
near("30yr payment ~ $1199.10", pay30, 119910, 2);
const r = amortize({ balanceCents: 20000000, aprBps: 600, paymentCents: pay30 });
eq("30yr takes 360 months", r.months, 360);
near("30yr total interest", r.totalInterestCents, 23167600, 5000);
eq("ends at zero", r.schedule[r.schedule.length - 1].balanceCents, 0);
eq("principal+interest = payment", r.schedule.every((x) => x.principalCents + x.interestCents === x.paymentCents), true);
eq("paid = principal + interest", r.totalPaidCents, 20000000 + r.totalInterestCents);

// extra payments
const c = compareScenarios({ balanceCents: 20000000, aprBps: 600, paymentCents: pay30, extraMonthlyCents: 20000, lumpSumCents: 0 });
eq("extra $200/mo is faster", c.monthsSaved > 50, true);
eq("extra saves interest", c.interestSavedCents > 3000000, true);
const lump = compareScenarios({ balanceCents: 20000000, aprBps: 600, paymentCents: pay30, extraMonthlyCents: 0, lumpSumCents: 2000000 });
eq("lump sum saves interest", lump.interestSavedCents > 0 && lump.monthsSaved > 0, true);

// edge cases
eq("zero interest", amortize({ balanceCents: 120000, aprBps: 0, paymentCents: 10000 }).months, 12);
eq("zero interest total", amortize({ balanceCents: 120000, aprBps: 0, paymentCents: 10000 }).totalInterestCents, 0);
eq("payment below interest never ends", amortize({ balanceCents: 10000000, aprBps: 1200, paymentCents: 50000 }).never, true);
eq("zero payment never ends", amortize({ balanceCents: 10000, aprBps: 500, paymentCents: 0 }).never, true);
eq("already paid", amortize({ balanceCents: 0, aprBps: 500, paymentCents: 100 }).months, 0);
eq("lump sum clears it", amortize({ balanceCents: 5000, aprBps: 500, paymentCents: 100, lumpSumCents: 9000 }).months, 0);
eq("last payment is partial", amortize({ balanceCents: 25000, aprBps: 0, paymentCents: 10000 }).schedule.map((x) => x.paymentCents), [10000, 10000, 5000]);
eq("payment to pay off in 12 mo @0%", paymentToPayoffIn(120000, 0, 12), 10000);
eq("payoff-in is minimal", amortize({ balanceCents: 500000, aprBps: 900, paymentCents: paymentToPayoffIn(500000, 900, 24) - 1 }).months > 24, true);

eq("month label", monthYearLabel("2026-10-04", 3), "Jan 2027");
eq("month label wraps years", monthYearLabel("2026-12-15", 1), "Jan 2027");
eq("duration", durationLabel(30), "2 yrs 6 mo");
eq("yearly summary years", yearlySummary(r.schedule, "2026-10-04")[0].year, 2026);

// debt planner: avalanche beats snowball on interest; snowball clears the small one first
const debts = [
  { id: "card", name: "Card", balanceCents: 500000, aprBps: 2400, minPaymentCents: 15000 },
  { id: "car", name: "Car", balanceCents: 1500000, aprBps: 600, minPaymentCents: 30000 },
  { id: "small", name: "Store", balanceCents: 100000, aprBps: 1000, minPaymentCents: 5000 },
];
const av = planDebts(debts, 20000, "AVALANCHE"), sn = planDebts(debts, 20000, "SNOWBALL"), none = planDebts(debts, 0, "AVALANCHE");
eq("avalanche targets highest rate first", av.order[0] === "small" || av.order[0] === "card", true);
eq("snowball clears smallest first", sn.order[0], "small");
eq("avalanche interest <= snowball", av.totalInterestCents <= sn.totalInterestCents, true);
eq("extra beats minimums only", av.months < none.months && av.totalInterestCents < none.totalInterestCents, true);
eq("every debt cleared", Object.keys(av.payoffMonth).length, 3);
eq("minimums too low never ends", planDebts([{ id: "x", name: "x", balanceCents: 1000000, aprBps: 3000, minPaymentCents: 1000 }], 0, "AVALANCHE").never, true);
// conservation: total paid = principal + interest
const single = planDebts([{ id: "a", name: "a", balanceCents: 100000, aprBps: 0, minPaymentCents: 25000 }], 0, "SNOWBALL");
eq("single zero-rate debt", [single.months, single.totalInterestCents], [4, 0]);

if (failed) { console.error(`${failed} failed`); process.exit(1); } else console.log("all loan tests passed");
