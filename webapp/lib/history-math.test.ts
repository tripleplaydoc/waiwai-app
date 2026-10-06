import assert from "node:assert/strict";
import { bridge, classifyHistoryRow, deductibleAmount, isDeductibleType, kindFor } from "./history-math";

// classification
let c = classifyHistoryRow({ payee: "Zoom.us", memo: "", amountCents: -1599, isBusiness: true });
assert.deepEqual(c, { kind: "EXPENSE", typeKey: "SOFTWARE", isTaxDeductible: true });
c = classifyHistoryRow({ payee: "Online transfer to savings", memo: "", amountCents: -50000, isBusiness: true });
assert.equal(c.kind, "TRANSFER");
c = classifyHistoryRow({ payee: "Client payment", memo: "", amountCents: 150000, isBusiness: true });
assert.deepEqual(c, { kind: "INCOME", typeKey: null, isTaxDeductible: false });
c = classifyHistoryRow({ payee: "Foodland", memo: "", amountCents: -8417, isBusiness: false });
assert.deepEqual(c, { kind: "EXPENSE", typeKey: "FOOD", isTaxDeductible: false });
c = classifyHistoryRow({ payee: "Foodland", memo: "", amountCents: -8417, isBusiness: true });
assert.equal(c.typeKey, null, "a personal type is not guessed in a business workspace");
// processor payouts are sales, not transfers; the bank's own labels are respected
c = classifyHistoryRow({ payee: "STRIPE TRANSFER ID NBR: ST-ABC", memo: "", amountCents: 878083, isBusiness: true });
assert.deepEqual(c, { kind: "INCOME", typeKey: null, isTaxDeductible: false });
c = classifyHistoryRow({ payee: "PAYPAL TRANSFER", memo: "", amountCents: 1273282, isBusiness: true });
assert.equal(c.kind, "INCOME");
c = classifyHistoryRow({ payee: "PAYPAL INSTANT TRANSFER INST XFER", memo: "", amountCents: -7034, isBusiness: true });
assert.equal(c.kind, "TRANSFER", "money out to a processor stays a transfer");
c = classifyHistoryRow({ payee: "Some client", memo: "", amountCents: 50000, isBusiness: true, category: "Revenue" });
assert.deepEqual(c, { kind: "INCOME", typeKey: "SALES", isTaxDeductible: false });
c = classifyHistoryRow({ payee: "Online banking", memo: "", amountCents: 50000, isBusiness: true, category: "Bank Transfer" });
assert.equal(c.kind, "TRANSFER");
c = classifyHistoryRow({ payee: "CHASE CARD", memo: "", amountCents: -50000, isBusiness: true, category: "Credit Card Payment" });
assert.equal(c.kind, "TRANSFER");
c = classifyHistoryRow({ payee: "Zoom.us", memo: "", amountCents: -1599, isBusiness: true, category: "Uncategorized" });
assert.equal(c.typeKey, "SOFTWARE", "other labels do not override the payee rules");
assert.equal(kindFor("SALES", -500), "INCOME"); assert.equal(kindFor("SOFTWARE", 500), "EXPENSE", "a refund nets against its expense");
assert.equal(isDeductibleType("OWNER_DRAW", true), false); assert.equal(isDeductibleType("SOFTWARE", false), false);
assert.equal(deductibleAmount(8000, "MEALS"), 4000); assert.equal(deductibleAmount(8000, "TRAVEL"), 8000);

// bridge
const rows = [100000, -2500, -4200, 5000];
let b = bridge({ startBalanceCents: 10000, historyNetCents: 98300, openingCents: 108300, rowAmounts: rows });
assert.equal(b.state, "ok"); assert.equal(b.impliedCents, 108300);
b = bridge({ startBalanceCents: 10000, historyNetCents: 98300, openingCents: 112500, rowAmounts: rows });
assert.equal(b.state, "off"); assert.equal(b.gapCents, 4200);
assert.ok(b.hints.some((h) => h.includes("$42.00") && h.includes("entered twice")), "a matching withdrawal is called out");
b = bridge({ startBalanceCents: 0, historyNetCents: 5000, openingCents: 0, rowAmounts: [5000] });
assert.equal(b.gapCents, -5000); assert.ok(b.hints[0].includes("too much"));
assert.equal(bridge({ startBalanceCents: null, historyNetCents: 1, openingCents: 0, rowAmounts: [1] }).state, "no-start");
assert.equal(bridge({ startBalanceCents: 0, historyNetCents: 0, openingCents: 0, rowAmounts: [] }).state, "no-history");
console.log("history-math: ok");
