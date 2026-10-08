import assert from "node:assert/strict";
import { buildStewardship, bucketByName, bucketFor, hasFlowMapping, percentSplit, stewardCaption, type FlowMapping, type OutflowEntry } from "./stewardship";

const e = (label: string, cents: number, o: Partial<OutflowEntry> = {}): OutflowEntry => ({ label, cents, groupId: null, groupName: null, ...o });

// percents always add to 100
assert.deepEqual(percentSplit([1, 1, 1]), [34, 33, 33]);
assert.equal(percentSplit([5000, 3000, 2000]).reduce((s, n) => s + n, 0), 100);
assert.deepEqual(percentSplit([0, 0, 0]), [0, 0, 0]);
assert.deepEqual(percentSplit([100, 0, 0]), [100, 0, 0]);

// name fallback
assert.equal(bucketByName("Giving", "Tithing"), "GIVE");
assert.equal(bucketByName("Savings", "Emergency Fund"), "SAVE");
assert.equal(bucketByName("Everyday", "Groceries"), "LIVE");
assert.equal(bucketByName("Bills", "Insurance"), "LIVE");
assert.equal(bucketByName("Everyday", "Fun money"), "LIVE");

// flow mapping wins over names; reserve counts as save; unmapped = live
const map: FlowMapping = { give: ["g1"], save: ["s1"], live: ["l1"], reserve: ["r1"] };
assert.ok(hasFlowMapping(map));
assert.ok(!hasFlowMapping({ give: [], save: [], live: [], reserve: [] }));
assert.ok(!hasFlowMapping(null));
assert.equal(bucketFor(e("Savings pocket", 1, { groupId: "l1", groupName: "Savings" }), map), "LIVE");
assert.equal(bucketFor(e("Cushion", 1, { groupId: "r1" }), map), "SAVE");
assert.equal(bucketFor(e("Other", 1, { groupId: "zzz" }), map), "LIVE");
assert.equal(bucketFor(e("Gold", 1, { groupId: "zzz", keeps: true }), map), "SAVE");
assert.equal(bucketFor(e("Gold", 1, { groupId: "l1", keeps: true }), map), "SAVE");
assert.equal(bucketFor(e("Gift fund", 1, { groupId: "g1", keeps: true }), map), "GIVE");
assert.equal(bucketFor(e("To savings", 1, { kept: true, groupId: "g1" }), map), "SAVE");
assert.equal(bucketFor(e("Gold", 1, { keeps: true }), null), "SAVE");

// build
const r = buildStewardship([
  e("Tithing", 20000, { groupId: "g1" }), e("Rent", 100000, { groupId: "l1" }), e("Groceries", 30000, { groupId: "l1" }),
  e("Groceries", 5000, { groupId: "l1" }), e("Moved to SoFi Savings", 25000, { kept: true }), e("Rent", 0),
], map);
assert.equal(r.mode, "flow");
assert.equal(r.totalCents, 180000);
assert.deepEqual(r.slices.map((s) => s.cents), [20000, 25000, 135000]);
assert.equal(r.slices.reduce((s, x) => s + x.pct, 0), 100);
assert.deepEqual(r.slices[2].top, [{ label: "Rent", cents: 100000 }, { label: "Groceries", cents: 35000 }]);
assert.equal(r.caption, "Your water supports your life today, your future, and the people and causes you care about.");

// fallback mode + refunds never go below zero
const f = buildStewardship([e("Groceries", 10000, { groupName: "Everyday" }), e("Groceries", -2500, { groupName: "Everyday" }), e("Donation", 1000)], null);
assert.equal(f.mode, "names");
assert.deepEqual(f.slices.map((s) => s.cents), [1000, 0, 7500]);
const refundOnly = buildStewardship([e("Groceries", -500)], null);
assert.equal(refundOnly.totalCents, 0);
assert.equal(refundOnly.caption, "");

// empty
const empty = buildStewardship([], map);
assert.equal(empty.totalCents, 0);
assert.deepEqual(empty.slices.map((s) => s.pct), [0, 0, 0]);

// captions
assert.equal(stewardCaption({ GIVE: 0, SAVE: 0, LIVE: 5 }).startsWith("Your water is all supporting life today"), true);
assert.equal(stewardCaption({ GIVE: 0, SAVE: 3, LIVE: 5 }), "Your water supports your life today and your future.");
assert.equal(stewardCaption({ GIVE: 3, SAVE: 0, LIVE: 0 }), "Your water supports the people and causes you care about.");
console.log("stewardship ok");
