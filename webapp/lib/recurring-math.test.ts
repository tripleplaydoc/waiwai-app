import assert from "node:assert/strict";
import { dueDates, monthlyEquivalent, nextOccurrence } from "./recurring-math";

assert.equal(nextOccurrence("2026-10-05", "WEEKLY", 5), "2026-10-12");
assert.equal(nextOccurrence("2026-10-05", "BIWEEKLY", 5), "2026-10-19");
// Month ends: the 31st holds across short months and returns to the 31st.
assert.equal(nextOccurrence("2026-01-31", "MONTHLY", 31), "2026-02-28");
assert.equal(nextOccurrence("2026-02-28", "MONTHLY", 31), "2026-03-31");
assert.equal(nextOccurrence("2028-01-31", "MONTHLY", 31), "2028-02-29");
assert.equal(nextOccurrence("2026-11-15", "QUARTERLY", 15), "2027-02-15");
assert.equal(nextOccurrence("2028-02-29", "YEARLY", 29), "2029-02-28");
assert.equal(nextOccurrence("2026-12-10", "MONTHLY", 10), "2027-01-10");

// Catching up: missed Aug and Sep and Oct, today Oct 5 with a monthly on the 3rd.
assert.deepEqual(dueDates("2026-08-03", "MONTHLY", 3, "2026-10-05", null), ["2026-08-03", "2026-09-03", "2026-10-03"]);
assert.deepEqual(dueDates("2026-10-06", "MONTHLY", 6, "2026-10-05", null), []);
assert.deepEqual(dueDates("2026-08-03", "MONTHLY", 3, "2026-10-05", "2026-09-30"), ["2026-08-03", "2026-09-03"]);
assert.equal(dueDates("2020-01-01", "WEEKLY", 1, "2026-10-05", null).length, 24); // capped

assert.equal(monthlyEquivalent(-1200, "YEARLY"), 100);
assert.equal(monthlyEquivalent(-1000, "WEEKLY"), 4333);
console.log("recurring-math tests passed");
