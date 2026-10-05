import assert from "node:assert/strict";
import { pocketProgress } from "./targets";

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
console.log("targets: ok");
