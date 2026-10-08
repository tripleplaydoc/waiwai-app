import assert from "node:assert/strict";
import { dayWord, flowNudge, isSnoozed, snoozeUntil } from "./flow-nudge";

const today = "2026-10-20";
// $600 ten days ago + $300 yesterday, pool $900: the $600 has been resting 10 days
assert.deepEqual(flowNudge({ today, poolCents: 90000, deposits: [{ date: "2026-10-10", cents: 60000 }, { date: "2026-10-19", cents: 30000 }] }), { cents: 60000, days: 10 });
// pool smaller than the deposits: newest money is what's left, so it is recent
assert.equal(flowNudge({ today, poolCents: 25000, deposits: [{ date: "2026-10-10", cents: 60000 }, { date: "2026-10-19", cents: 30000 }] }), null);
// pool covers part of an old deposit
assert.deepEqual(flowNudge({ today, poolCents: 40000, deposits: [{ date: "2026-10-05", cents: 60000 }, { date: "2026-10-19", cents: 10000 }] }), { cents: 30000, days: 15 });
// exactly 7 days counts, 6 does not
assert.deepEqual(flowNudge({ today, poolCents: 10000, deposits: [{ date: "2026-10-13", cents: 10000 }] }), { cents: 10000, days: 7 });
assert.equal(flowNudge({ today, poolCents: 10000, deposits: [{ date: "2026-10-14", cents: 10000 }] }), null);
// nothing in the pool, or overspent pool
assert.equal(flowNudge({ today, poolCents: 0, deposits: [{ date: "2026-09-01", cents: 10000 }] }), null);
assert.equal(flowNudge({ today, poolCents: -500, deposits: [{ date: "2026-09-01", cents: 10000 }] }), null);
// tiny amounts stay quiet
assert.equal(flowNudge({ today, poolCents: 300, deposits: [{ date: "2026-09-01", cents: 300 }] }), null);
// unsorted input, future-dated and zero deposits ignored
assert.deepEqual(flowNudge({ today, poolCents: 50000, deposits: [{ date: "2026-10-19", cents: 0 }, { date: "2026-10-01", cents: 50000 }, { date: "2026-10-25", cents: 99999 }] }), { cents: 50000, days: 19 });
// several old deposits: oldest age is reported
assert.deepEqual(flowNudge({ today, poolCents: 30000, deposits: [{ date: "2026-09-20", cents: 10000 }, { date: "2026-10-01", cents: 20000 }] }), { cents: 30000, days: 30 });
// no deposits at all
assert.equal(flowNudge({ today, poolCents: 1000, deposits: [] }), null);

// snooze
assert.equal(snoozeUntil("2026-10-30"), "2026-11-02");
assert.equal(isSnoozed("2026-10-23", "2026-10-22"), true);
assert.equal(isSnoozed("2026-10-23", "2026-10-23"), false);
assert.equal(isSnoozed(undefined, "2026-10-23"), false);
assert.equal(isSnoozed("garbage", "2026-10-23"), false);
assert.equal(dayWord(1), "1 day");
assert.equal(dayWord(12), "12 days");
console.log("flow-nudge ok");
