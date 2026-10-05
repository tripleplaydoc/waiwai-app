import assert from "node:assert/strict";
import { flowSlices } from "./flow-math";
import { freedomNumberCents, runwayDays, savingsRatePct, yearsToTarget } from "./growth-math";

const s = flowSlices(1_000_000, [{ label: "Rent", cents: 350_000 }, { label: "Software", cents: 20_000 }, { label: "Food", cents: 150_000 }, { label: "Fees", cents: 5_000 }], 100_000);
assert.deepEqual(s.map((x) => x.label), ["Rent", "Food", "Everything else", "Taxes paid", "Kept"]);
assert.equal(s[0].per100Cents, 3500, "$35 of every $100 went to rent");
assert.equal(s.find((x) => x.label === "Everything else")!.cents, 25_000, "small items fold together");
assert.equal(s.find((x) => x.label === "Kept")!.cents, 375_000);
assert.equal(s.reduce((t, x) => t + x.per100Cents, 0), 10000, "slices add to $100");
const o = flowSlices(100_000, [{ label: "Rent", cents: 130_000 }], 0);
assert.equal(o[o.length - 1].kind, "over"); assert.equal(o[o.length - 1].cents, 30_000);
assert.deepEqual(flowSlices(0, [{ label: "x", cents: 1 }], 0), []);

assert.equal(savingsRatePct(1_000_000, 800_000), 20); assert.equal(savingsRatePct(0, 5), null); assert.equal(savingsRatePct(100, 150), -50);
assert.equal(runwayDays(3_000_000, 900_000, 90), 300, "$30k cash at $100/day lasts 300 days");
assert.equal(runwayDays(100, 0, 90), null);
assert.equal(freedomNumberCents(900_000, 90), 36_500_000 * 25 / 10 * 1, "$100/day -> $36,500/yr -> x25");
assert.equal(yearsToTarget(0, 12_000_000, 500_000), 2, "$120k at $5k a month = 2 years");
assert.equal(yearsToTarget(5, 1, 0), 0); assert.equal(yearsToTarget(0, 10, 0), null);
console.log("coach-math: ok");
