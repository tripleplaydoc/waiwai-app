import assert from "node:assert/strict";
import { amountText, matchesSearch, searchTokens } from "./search-text";

assert.deepEqual(searchTokens("  $1,200  Foodland "), ["1200", "foodland"]);
assert.equal(amountText(-8417), "84.17");
assert.equal(amountText(5), "0.05");
assert.equal(amountText(120000), "1200.00");
const f = ["Foodland", "Weekly shop", "Groceries", amountText(-8417)];
assert.ok(matchesSearch(f, ""));
assert.ok(matchesSearch(f, "FOOD"));
assert.ok(matchesSearch(f, "groc 84.17"));
assert.ok(matchesSearch(f, "$84"));
assert.ok(!matchesSearch(f, "gas"));
assert.ok(!matchesSearch(f, "food gas"));
assert.ok(!matchesSearch([null, undefined, ""], "x"));
console.log("search-text ok");
