import assert from "node:assert/strict";
import { planRebalance } from "./rebalance-math";

// Cash Reservoir is over-tagged by 600 cents; Savings has 593 free and Venmo 100 free.
const pools = new Map<string | null, number>([["res", -600], ["sav", 593], ["ven", 100]]);
const holdings = new Map([["groc", [["res", 300]] as [string, number][]], ["cash", [["res", 900]] as [string, number][]]]);
const moves = planRebalance(pools, holdings);
const total = moves.reduce((s, m) => s + m.cents, 0);
assert.equal(total, 600);
assert.equal(moves.filter((m) => m.to === "sav").reduce((s, m) => s + m.cents, 0), 593);
assert.equal(moves.filter((m) => m.to === "ven").reduce((s, m) => s + m.cents, 0), 7);
assert.ok(moves.every((m) => m.from === "res"));
// Never moves more than the pockets hold or more than there is free cash.
const small = planRebalance(new Map<string | null, number>([["res", -600], ["sav", 100]]), holdings);
assert.equal(small.reduce((s, m) => s + m.cents, 0), 100);
// Nothing to fix.
assert.deepEqual(planRebalance(new Map<string | null, number>([["res", 5]]), holdings), []);
// An account with nothing tagged to it cannot be fixed by moving labels.
assert.deepEqual(planRebalance(new Map<string | null, number>([["x", -50], ["sav", 100]]), holdings), []);
console.log("rebalance-math ok");
