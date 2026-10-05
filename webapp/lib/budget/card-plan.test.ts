import assert from "node:assert/strict";
import { planCard } from "./card-plan";

// $2,300 owed on a $10,000 limit, closing in 4 days, due in 20: aim to report $900 (9%), so pay $1,400 by day 2.
const a = planCard({ owedCents: 230_000, limitCents: 1_000_000, closeIso: "2026-10-09", closeDays: 4, dueIso: "2026-10-29", dueDays: 24 });
assert.equal(a.payDownCents, 140_000);
assert.equal(a.payByIso, "2026-10-07");
assert.equal(a.payByDays, 2);
assert.equal(a.reportedPct, 9);
assert.equal(a.closeAlert, true);
assert.equal(a.dueAlert, false);

// Already under the target: nothing to pay early.
const b = planCard({ owedCents: 50_000, limitCents: 1_000_000, closeIso: "2026-10-09", closeDays: 4, dueIso: null, dueDays: null });
assert.equal(b.payDownCents, 0); assert.equal(b.closeAlert, false);

// No limit known: suggest paying it all before the close. Close far away: no alert yet.
const c = planCard({ owedCents: 80_000, limitCents: null, closeIso: "2026-11-01", closeDays: 27, dueIso: null, dueDays: null });
assert.equal(c.payDownCents, 80_000); assert.equal(c.reportedPct, null); assert.equal(c.closeAlert, false);

// Due soon with a balance raises the due reminder; crossing a month boundary for the date.
const d = planCard({ owedCents: 10_000, limitCents: null, closeIso: "2026-11-01", closeDays: 1, dueIso: "2026-10-08", dueDays: 3 });
assert.equal(d.dueAlert, true); assert.equal(d.payByIso, "2026-10-30"); assert.equal(d.payByDays, -1);
console.log("card-plan tests passed");
