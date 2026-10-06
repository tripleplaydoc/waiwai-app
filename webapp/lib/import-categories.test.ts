import assert from "node:assert/strict";
import { distinctCategories, matchCategoryName, type PocketRef } from "./import-categories";

const p = (id: string, name: string): PocketRef => ({ id, name, group: "G" });
const pockets = [p("a", "Software"), p("b", "Software & Subscriptions"), p("c", "Meals"), p("d", "Business Meals"), p("e", "Rent"), p("f", "Office Expenses"), p("g", "Gas")];
assert.equal(matchCategoryName("Office Expenses", pockets), "f", "exact");
assert.equal(matchCategoryName("software and subscriptions", pockets), "b", "and vs &, case");
assert.equal(matchCategoryName("Meals", pockets), "c", "exact beats contains");
assert.equal(matchCategoryName("Gas & Fuel", pockets), null, "no pocket named that");
assert.equal(matchCategoryName("Software and Subscriptions", [p("a", "Software"), p("x", "Subscriptions")]), null, "two near matches: do not guess");
assert.equal(matchCategoryName("Uncategorized", pockets), null);
assert.equal(matchCategoryName("Revenue", [p("r", "Revenue")]), null);
assert.equal(matchCategoryName("Credit Card Payment", [p("r", "Credit Card Payment")]), null, "transfers are not expenses");
assert.equal(matchCategoryName("", pockets), null);
assert.equal(matchCategoryName("Rent", [p("e", "Rent"), p("e2", "Rent")]), null, "duplicate names are ambiguous");
assert.deepEqual(distinctCategories([
  { category: "Meals", amountCents: -100 }, { category: "Meals", amountCents: -5 }, { category: "Rent", amountCents: -1 },
  { category: "Revenue", amountCents: 500 }, { category: "Uncategorized", amountCents: -9 }, { amountCents: -3 },
]), [{ name: "Meals", count: 2 }, { name: "Rent", count: 1 }]);
console.log("import-categories ok");
