import { planAssign, planCover, reserveTarget, type AssignInput } from "./cashflow-waterfall";

let failed = 0;
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { failed++; console.error(`FAIL ${name}\n  got      ${JSON.stringify(a)}\n  expected ${JSON.stringify(b)}`); } else console.log(`ok   ${name}`);
};

const base: AssignInput = {
  readyCents: 100000, taxBps: 3000,
  opex: [{ id: "o1", needCents: 40000 }, { id: "o2", needCents: 20000 }],
  monthlyOpexCents: 60000,
  taxId: "tax",
  reservoir1: { id: "r1", balanceCents: 0, months: 3 },
  reservoir2: { id: "r2", balanceCents: 0, months: 3, shareBps: 5000 },
  cash: [{ id: "c1", bps: 5000 }, { id: "c2", bps: 3000 }, { id: "c3", bps: 2000 }],
  draws: [],
};
const sum = (p: ReturnType<typeof planAssign>) => p.moves.reduce((s, m) => s + m.cents, 0);

// 30/70 and OPEX filled exactly
let p = planAssign({ ...base, readyCents: 100000, opex: [{ id: "o1", needCents: 70000 }] });
eq("30/70 split", [p.totals.taxes, p.totals.opex, p.totals.reservoir1], [30000, 70000, 0]);
eq("opex filled flag", p.opexFilled, true);

// OPEX not filled: all 70% stays in OPEX, nothing reaches R1
p = planAssign(base);
eq("opex short", [p.totals.taxes, p.totals.opex, p.totals.reservoir1], [30000, 60000, 10000]);
// need 60000 only, 70000 available -> 10000 overflows to R1
eq("overflow to R1", p.moves.find((m) => m.kind === "RESERVOIR_1")?.cents, 10000);

p = planAssign({ ...base, readyCents: 50000 });
eq("partial opex proportional", p.moves.filter((m) => m.kind === "OPEX").map((m) => m.cents), [23333, 11667]);
eq("partial opex nothing to R1", p.totals.reservoir1, 0);
eq("conservation", sum(p) + p.leftoverCents, 50000);

// R1 target = 3 x monthly
eq("reserveTarget", reserveTarget(60000, 3), 180000);
eq("reserveTarget fractional", reserveTarget(60000, 2.5), 150000);

// R1 fills then 50/50 to R2 and Cash
p = planAssign({ ...base, readyCents: 1000000, opex: [{ id: "o1", needCents: 60000 }], reservoir1: { id: "r1", balanceCents: 170000, months: 3 } });
// tax 300000, opex 60000, overflow 640000; R1 needs 10000 -> rest 630000; half (315000) offered to R2 but R2 only has room for 180000 -> cash gets 450000
eq("R1 topped off", p.totals.reservoir1, 10000);
eq("R2 capped at its target", p.totals.reservoir2, 180000);
eq("rest goes to cash", p.totals.cash, 450000);
eq("cash pocket split", p.moves.filter((m) => m.kind === "CASH").map((m) => m.cents), [225000, 135000, 90000]);
eq("conservation big", sum(p) + p.leftoverCents, 1000000);

// R2 has plenty of room: true 50/50
p = planAssign({ ...base, readyCents: 1000000, opex: [{ id: "o1", needCents: 60000 }], monthlyOpexCents: 600000, reservoir1: { id: "r1", balanceCents: 1790000, months: 3 } });
eq("50/50 R2 and cash", [p.totals.reservoir1, p.totals.reservoir2, p.totals.cash], [10000, 315000, 315000]);

// R2 full: everything to cash
p = planAssign({ ...base, readyCents: 100000, opex: [], reservoir1: { id: "r1", balanceCents: 180000, months: 3 }, reservoir2: { id: "r2", balanceCents: 180000, months: 3, shareBps: 5000 } });
eq("all full -> cash", [p.totals.taxes, p.totals.cash, p.totals.reservoir2], [30000, 70000, 0]);
eq("flags", [p.reservoir1Filled, p.reservoir2Filled], [true, true]);

// R2 only has a little room: the excess goes to cash
p = planAssign({ ...base, readyCents: 100000, opex: [], reservoir1: { id: "r1", balanceCents: 180000, months: 3 }, reservoir2: { id: "r2", balanceCents: 175000, months: 3, shareBps: 5000 } });
eq("R2 capped", [p.totals.reservoir2, p.totals.cash], [5000, 65000]);

// cash percentages that don't add to 100 leave money in Ready to assign
p = planAssign({ ...base, readyCents: 100000, opex: [], reservoir1: { id: "r1", balanceCents: 180000, months: 3 }, reservoir2: { id: "r2", balanceCents: 180000, months: 3, shareBps: 5000 }, cash: [{ id: "c1", bps: 6000 }] });
eq("cash pct < 100 leaves remainder", [p.totals.cash, p.leftoverCents], [42000, 28000]);

// repay first
p = planAssign({ ...base, readyCents: 100000, draws: [{ id: "d1", bucket: "RESERVOIR_1", outstandingCents: 20000 }, { id: "d2", bucket: "TAXES", outstandingCents: 10000 }] });
eq("repay first", [p.totals.repay, p.repayments], [30000, [{ drawId: "d1", cents: 20000 }, { drawId: "d2", cents: 10000 }]]);
eq("then split on remainder", [p.totals.taxes, p.totals.opex + p.totals.reservoir1], [21000, 49000]);
p = planAssign({ ...base, readyCents: 15000, draws: [{ id: "d1", bucket: "RESERVOIR_1", outstandingCents: 20000 }] });
eq("repay uses everything if short", [p.totals.repay, p.totals.taxes, p.totals.opex], [15000, 0, 0]);

// zero / negative ready
p = planAssign({ ...base, readyCents: 0 });
eq("nothing to assign", p.moves.length, 0);
p = planAssign({ ...base, readyCents: -500 });
eq("negative ready", p.moves.length, 0);

// no OPEX targets at all: R1 target 0, flows to R2 / cash
p = planAssign({ ...base, readyCents: 10000, opex: [], monthlyOpexCents: 0 });
eq("no opex targets", [p.totals.taxes, p.totals.opex, p.totals.reservoir1, p.totals.reservoir2, p.totals.cash], [3000, 0, 0, 0, 7000]);

// cover
let c = planCover({ shortfalls: [{ id: "o1", name: "Ads", cents: 10000 }], taxId: "tax", taxBalanceCents: 50000, reservoir1Id: "r1", reservoir1BalanceCents: 50000, reservoir2Id: "r2", reservoir2BalanceCents: 50000 });
eq("cover 50/50", c.draws.map((d) => [d.bucket, d.cents]), [["TAXES", 5000], ["RESERVOIR_1", 5000]]);
c = planCover({ shortfalls: [{ id: "o1", name: "Ads", cents: 10000 }], taxId: "tax", taxBalanceCents: 1000, reservoir1Id: "r1", reservoir1BalanceCents: 50000, reservoir2Id: "r2", reservoir2BalanceCents: 50000 });
eq("cover: taxes short, R1 picks up", c.draws.map((d) => [d.bucket, d.cents]), [["TAXES", 1000], ["RESERVOIR_1", 9000]]);
c = planCover({ shortfalls: [{ id: "o1", name: "Ads", cents: 10000 }], taxId: "tax", taxBalanceCents: 1000, reservoir1Id: "r1", reservoir1BalanceCents: 2000, reservoir2Id: "r2", reservoir2BalanceCents: 50000 });
eq("cover: R2 last", c.draws.map((d) => [d.bucket, d.cents]), [["TAXES", 1000], ["RESERVOIR_1", 2000], ["RESERVOIR_2", 7000]]);
c = planCover({ shortfalls: [{ id: "o1", name: "Ads", cents: 10000 }], taxId: "tax", taxBalanceCents: 0, reservoir1Id: "r1", reservoir1BalanceCents: 0, reservoir2Id: "r2", reservoir2BalanceCents: 3000 });
eq("cover: not enough anywhere", [c.coveredCents, c.uncoveredCents], [3000, 7000]);
c = planCover({ shortfalls: [{ id: "o1", name: "A", cents: 333 }], taxId: "tax", taxBalanceCents: 1000, reservoir1Id: "r1", reservoir1BalanceCents: 1000, reservoir2Id: "r2", reservoir2BalanceCents: 0 });
eq("odd cents", c.draws.map((d) => d.cents).reduce((s, n) => s + n, 0), 333);

if (failed) { console.error(`${failed} failed`); process.exit(1); } else console.log("all passed");
