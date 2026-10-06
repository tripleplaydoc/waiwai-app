import assert from "node:assert/strict";
import { aheadNeedCents, coverTotals, parseHorizon, parseMode } from "./horizon";

const m = { targetType: "MONTHLY_FUNDING" as const, targetCents: 100000 };
// Nothing set aside yet: this month 1000 + next month 1000.
assert.equal(aheadNeedCents({ ...m, availableCents: 0, activityCents: 0, stillThisMonthCents: 100000 }), 200000);
// Funded for this month only: next month still needs a full 1000.
assert.equal(aheadNeedCents({ ...m, availableCents: 100000, activityCents: 0, stillThisMonthCents: 0 }), 100000);
// Already holds two months: nothing more needed.
assert.equal(aheadNeedCents({ ...m, availableCents: 200000, activityCents: 0, stillThisMonthCents: 0 }), 0);
// Paid this month already (spent 1000), holds 1000 for next: covered.
assert.equal(aheadNeedCents({ ...m, availableCents: 100000, activityCents: -100000, stillThisMonthCents: 0 }), 0);
// Goals only count this month's need.
assert.equal(aheadNeedCents({ targetType: "TARGET_BALANCE", targetCents: 500000, availableCents: 0, activityCents: 0, stillThisMonthCents: 7000 }), 7000);
assert.equal(aheadNeedCents({ targetType: null, targetCents: 0, availableCents: 0, activityCents: 0, stillThisMonthCents: 0 }), 0);
assert.deepEqual(coverTotals([100, 250, 0], 300), { stillCents: 350, canCover: false, shortfallCents: 50 });
assert.deepEqual(coverTotals([100], 100), { stillCents: 100, canCover: true, shortfallCents: 0 });
assert.equal(parseHorizon("ahead"), "ahead"); assert.equal(parseHorizon("x"), "now"); assert.equal(parseMode(undefined), "simple"); assert.equal(parseMode("advanced"), "advanced");
console.log("horizon ok");
