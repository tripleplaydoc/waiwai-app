import assert from "node:assert/strict";
import { budgetHealth, pocketProgress } from "./targets";

const month = new Date("2026-10-01T00:00:00.000Z");
const base = { assignedCents: 0, activityCents: 0, availableCents: 0, targetType: "MONTHLY_FUNDING" as const, targetCents: 20000, targetDate: null };

// A paid monthly cost has nothing left to fund this month.
assert.equal(pocketProgress(base, month).stillNeededCents, 20000, "unpaid and unfunded needs the full amount");
const ticked = pocketProgress({ ...base, manualPaid: true }, month);
assert.equal(ticked.stillNeededCents, 0, "ticked paid needs nothing");
assert.equal(ticked.state, "funded");
assert.equal(pocketProgress({ ...base, activityCents: -20000 }, month).stillNeededCents, 0, "fully spent counts as paid even if funded in an earlier month");
assert.equal(pocketProgress({ ...base, activityCents: -5000 }, month).stillNeededCents, 20000, "partial spending is not paid");
assert.equal(pocketProgress({ ...base, targetType: "TARGET_BALANCE", manualPaid: true }, month).stillNeededCents, 20000, "goals ignore the paid tick");

// Months ahead keeps a cushion measured on the balance.
const ahead1 = { ...base, monthsAhead: 1 };
assert.equal(pocketProgress(ahead1, month).stillNeededCents, 40000, "1 month ahead, empty: this month + 1 more");
assert.equal(pocketProgress({ ...ahead1, availableCents: 30000 }, month).stillNeededCents, 10000, "partly funded");
assert.equal(pocketProgress({ ...ahead1, availableCents: 40000 }, month).stillNeededCents, 0, "fully funded");
assert.equal(pocketProgress({ ...ahead1, availableCents: 20000, manualPaid: true }, month).stillNeededCents, 0, "paid: only the cushion (1 month) is needed");
assert.equal(pocketProgress({ ...ahead1, availableCents: 5000, manualPaid: true }, month).stillNeededCents, 15000, "paid but cushion is short");
assert.equal(pocketProgress({ ...base, monthsAhead: 0 }, month).stillNeededCents, 20000, "0 behaves as before");
assert.equal(pocketProgress(ahead1, month).stillThisMonthCents, 20000, "cushion: this month part is just the cost");
assert.equal(pocketProgress({ ...ahead1, availableCents: 20000 }, month).stillThisMonthCents, 0, "this month funded, cushion not");
assert.equal(pocketProgress({ ...ahead1, availableCents: 20000 }, month).stillNeededCents, 20000, "cushion still counted per pocket");
assert.equal(pocketProgress({ ...ahead1, availableCents: 0, manualPaid: true }, month).stillThisMonthCents, 0, "paid: nothing for this month");
const h = budgetHealth([{ input: { ...ahead1, availableCents: 20000 }, progress: pocketProgress({ ...ahead1, availableCents: 20000 }, month) }], 0);
assert.equal(h.stillNeededCents, 0); assert.equal(h.cushionNeededCents, 20000); assert.equal(h.canCover, true, "covered this month despite cushion");
console.log("targets: ok");
