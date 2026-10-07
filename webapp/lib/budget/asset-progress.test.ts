import assert from "node:assert/strict";
import { assetProgress } from "./asset-progress";

// Halfway to a $10,000 goal.
assert.deepEqual(assetProgress(500000, 1000000), { hasGoal: true, fraction: 0.5, reached: false, remainingCents: 500000 });
// Worth nothing yet.
assert.deepEqual(assetProgress(0, 1000000), { hasGoal: true, fraction: 0, reached: false, remainingCents: 1000000 });
// Exactly at the goal counts as reached.
assert.deepEqual(assetProgress(1000000, 1000000), { hasGoal: true, fraction: 1, reached: true, remainingCents: 0 });
// Past the goal: the bar stops at full, nothing remains.
assert.deepEqual(assetProgress(1250000, 1000000), { hasGoal: true, fraction: 1, reached: true, remainingCents: 0 });
// No goal set: no bar to fill.
assert.deepEqual(assetProgress(500000, null), { hasGoal: false, fraction: 0, reached: false, remainingCents: 0 });
assert.deepEqual(assetProgress(500000, 0), { hasGoal: false, fraction: 0, reached: false, remainingCents: 0 });
// A negative valuation never draws a negative bar.
assert.deepEqual(assetProgress(-100, 1000), { hasGoal: true, fraction: 0, reached: false, remainingCents: 1000 });
console.log("asset-progress ok");
