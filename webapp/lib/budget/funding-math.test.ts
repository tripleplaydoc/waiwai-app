import assert from "node:assert/strict";
import { drawFromPools, mergeParts, pocketBalances, pocketShares, splitProRata, type Parts } from "./funding-math";

const sum = (p: Parts) => p.reduce((s, [, n]) => s + n, 0);
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name); };

ok("pro rata sums exactly", () => {
  const r = splitProRata([["a", 1], ["b", 1], ["c", 1]], 100);
  assert.equal(sum(r), 100);
  assert.deepEqual(r, [["a", 34], ["b", 33], ["c", 33]]);
});
ok("pro rata 2:1", () => assert.deepEqual(splitProRata([["a", 200], ["b", 100]], 90), [["a", 60], ["b", 30]]));
ok("pro rata ignores zero/negative weights", () => assert.deepEqual(splitProRata([["a", 0], ["b", -5], ["c", 7]], 50), [["c", 50]]));
ok("pro rata with nothing", () => { assert.deepEqual(splitProRata([], 50), []); assert.deepEqual(splitProRata([["a", 5]], 0), []); });
ok("pro rata large amounts stay exact", () => {
  const r = splitProRata([["a", 333_333_333], ["b", 666_666_667]], 123_456_789_00);
  assert.equal(sum(r), 123_456_789_00);
});
ok("draw prefers the chosen account then the biggest", () => {
  const r = drawFromPools([["chk", 500], ["sav", 900], ["biz", 300]], 1000, "chk");
  assert.deepEqual(r.parts, [["chk", 500], ["sav", 500]]);
  assert.equal(r.shortCents, 0);
});
ok("draw defaults to the biggest pool", () => {
  assert.deepEqual(drawFromPools([["chk", 500], ["sav", 900]], 400).parts, [["sav", 400]]);
});
ok("draw skips empty, negative and untagged pools and reports a shortfall", () => {
  const r = drawFromPools([["a", -100], ["b", 0], [null, 999], ["c", 250]], 400);
  assert.deepEqual(r.parts, [["c", 250]]);
  assert.equal(r.shortCents, 150);
});
ok("pocket shares follow the tags and sum to available", () => {
  const r = pocketShares([["chk", 30000], ["sav", 10000]], 20000); // spent 20,000 of 40,000
  assert.deepEqual(r, [["chk", 15000], ["sav", 5000]]);
});
ok("pocket shares: nothing available, or no tags", () => {
  assert.deepEqual(pocketShares([["chk", 100]], 0), []);
  assert.deepEqual(pocketShares([["chk", 100]], -50), []);
  assert.deepEqual(pocketShares([], 700), [[null, 700]]);
});
ok("merge", () => assert.deepEqual(mergeParts([["a", 5], ["b", 2], ["a", -5], ["b", 1]]), [["b", 3]]));
const CASH = new Set(["chk", "sav"]);
ok("balances: a purchase comes out of the account that paid", () => {
  const r = pocketBalances([["chk", 30000], ["sav", 20000]], [["chk", -10000]], CASH);
  assert.deepEqual(r, [["chk", 20000], ["sav", 20000]]);
});
ok("balances: tag too small, the rest comes out of the other tags in proportion", () => {
  const r = pocketBalances([["chk", 5000], ["sav", 30000], [null, 10000]], [["chk", -15000]], CASH); // 5000 from chk, 10000 spread over sav/null (3:1)
  assert.equal(sum(r), 30000);
  assert.deepEqual(r, [["sav", 22500], [null, 7500]]);
});
ok("balances: card spending comes out of every tag in proportion", () => {
  const r = pocketBalances([["chk", 30000], ["sav", 10000]], [["visa", -8000]], CASH);
  assert.deepEqual(r, [["chk", 24000], ["sav", 8000]]);
});
ok("balances: a refund lands in the account that received it", () => {
  assert.deepEqual(pocketBalances([["chk", 1000]], [["sav", 500]], CASH), [["chk", 1000], ["sav", 500]]);
});
ok("balances: overspending leaves nothing", () => {
  assert.deepEqual(pocketBalances([["chk", 1000]], [["chk", -2500]], CASH), []);
});
ok("balances always sum to assigned + activity when not overspent", () => {
  const r = pocketBalances([["chk", 12345], ["sav", 67890], [null, 111]], [["chk", -3000], ["visa", -777], ["sav", 250]], CASH);
  assert.equal(sum(r), 12345 + 67890 + 111 - 3000 - 777 + 250);
});
console.log(`all ${n} funding tests passed`);
