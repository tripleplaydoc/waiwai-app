import assert from "node:assert/strict";
import { filterGroups, groupForReview, reviewTotals, type ReviewRow } from "./history-review";

const row = (id: string, payee: string, amountCents: number, kind: string, typeKey: string | null, memo = ""): ReviewRow => ({ id, date: "2023-01-02", amountCents, payee, memo, account: "A", kind, typeKey });
const rows = [
  row("1", "Stripe", 10000, "INCOME", "SALES"), row("2", "Stripe", 5000, "INCOME", "SALES"),
  row("3", "Stripe", -300, "EXPENSE", "FEES"),
  row("4", "Venmo", 2000, "INCOME", null), row("5", "Venmo", 1000, "INCOME", "SALES"),
  row("6", "Savings", -50000, "TRANSFER", null, "to savings"),
];
const g = groupForReview(rows);
assert.equal(g.length, 4);
assert.equal(g[0].payee, "Savings"); // biggest first
const stripeIn = g.find((x) => x.key === "in|Stripe")!;
assert.equal(stripeIn.count, 2); assert.equal(stripeIn.totalCents, 15000); assert.equal(stripeIn.current, "SALES");
assert.equal(g.find((x) => x.key === "out|Stripe")!.current, "FEES");
const venmo = g.find((x) => x.payee === "Venmo")!;
assert.equal(venmo.current, null); assert.equal(venmo.needsType, 1);
assert.equal(filterGroups(g, "todo", "").length, 1);
assert.equal(filterGroups(g, "transfer", "").length, 1);
assert.equal(filterGroups(g, "in", "").length, 2);
assert.equal(filterGroups(g, "out", "").length, 1); // transfer excluded
assert.equal(filterGroups(g, "all", "to savings").length, 1);
const t = reviewTotals(rows);
assert.deepEqual(t, { incomeCents: 18000, expenseCents: 300, transferCents: 50000, transferCount: 1, needsType: 1, rows: 6 });
console.log("history-review ok");
