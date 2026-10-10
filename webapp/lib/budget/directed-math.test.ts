import assert from "node:assert/strict";
import { capDirected, planHeldEdit } from "./directed-math";

// capDirected: a $79.50 transfer; Tithing holds 60.00 in Venmo, Missions 50.00, Groceries 40.00.
const held = new Map([["tithe", 6000], ["miss", 5000], ["groc", 4000]]);
assert.deepEqual(capDirected([["tithe", 5000], ["miss", 2950]], held, 7950), [["tithe", 5000], ["miss", 2950]]);
// Never more than the pocket holds.
assert.deepEqual(capDirected([["tithe", 9000]], held, 7950), [["tithe", 6000]]);
// Never more than the transfer; earlier pockets win.
assert.deepEqual(capDirected([["tithe", 6000], ["miss", 5000]], held, 7950), [["tithe", 6000], ["miss", 1950]]);
// Blank, zero, negative, unknown pockets and repeats are dropped.
assert.deepEqual(capDirected([["tithe", 0], ["miss", -5], ["nope", 100], ["groc", 100], ["groc", 200]], held, 7950), [["groc", 100]]);
assert.deepEqual(capDirected([["tithe", 100]], held, 0), []);
// Total of what comes back never exceeds maxTotal.
const big = capDirected([["tithe", 6000], ["miss", 5000], ["groc", 4000]], held, 10000);
assert.equal(big.reduce((s, [, n]) => s + n, 0), 10000);

// planHeldEdit: Tithing should hold 5000 in SoFi (B) but holds 0; Groceries holds 300 in SoFi and should hold none.
const moves = planHeldEdit([
  { pocketId: "tithe", a: 6000, b: 0, targetB: 5000 },
  { pocketId: "groc", a: 3700, b: 300, targetB: 0 },
  { pocketId: "same", a: 100, b: 100, targetB: 100 },
]);
assert.deepEqual(moves, [{ pocketId: "tithe", from: "a", cents: 5000 }, { pocketId: "groc", from: "b", cents: 300 }]);
// The pocket's total is never exceeded.
assert.deepEqual(planHeldEdit([{ pocketId: "x", a: 100, b: 50, targetB: 99999 }]), [{ pocketId: "x", from: "a", cents: 100 }]);
assert.deepEqual(planHeldEdit([{ pocketId: "x", a: 100, b: 50, targetB: -5 }]), [{ pocketId: "x", from: "b", cents: 50 }]);
console.log("directed-math ok");

// resolveTakeFrom: move $26.35 of Cash; it holds 200.00 in Reservoir and 40.00 in Venmo.
import { resolveTakeFrom } from "./directed-math";
const heldCash = new Map([["res", 20000], ["ven", 4000]]);
const acctNames = new Map([["res", "Cash Reservoir"], ["ven", "Venmo"]]);
assert.deepEqual(resolveTakeFrom([["ven", 2635]], 2635, heldCash, acctNames, "Cash"), { ok: true, parts: [["ven", 2635]] });
assert.deepEqual(resolveTakeFrom([["ven", 1000], ["res", 1635], ["res", 0], ["x", -5]], 2635, heldCash, acctNames, "Cash"), { ok: true, parts: [["ven", 1000], ["res", 1635]] });
assert.deepEqual(resolveTakeFrom([["none", 500]], 500, new Map([["none", 500]]), acctNames, "Cash"), { ok: true, parts: [[null, 500]] });
const short = resolveTakeFrom([["ven", 2635]], 2635, new Map([["ven", 1000]]), acctNames, "Cash");
assert.equal(short.ok, false);
assert.match(!short.ok ? short.error : "", /Cash only holds \$10\.00 in Venmo, so it can't give \$26\.35/);
const off = resolveTakeFrom([["ven", 2000]], 2635, heldCash, acctNames, "Cash");
assert.match(!off.ok ? off.error : "", /add up to \$20\.00, but you are moving \$26\.35/);
assert.equal(resolveTakeFrom([], 2635, heldCash, acctNames, "Cash").ok, false);
console.log("take-from ok");
