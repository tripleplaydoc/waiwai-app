import assert from "node:assert/strict";
import { estimatedDueDates, homeOfficeSimplifiedCents, leverSavings, mileageDeductionCents, nextDue, projectYear } from "./tax-math";

assert.equal(nextDue("2026-10-05")!.date, "2027-01-15", "after Sep 15 the next installment is Jan 15");
assert.equal(nextDue("2026-10-05")!.label, "Q4");
assert.equal(nextDue("2026-09-10")!.date, "2026-09-15");
assert.equal(estimatedDueDates("2026-10-05").find((d) => d.label === "Q3")!.daysAway, -20);
assert.equal(leverSavings(1_000_000, 3000), 300_000, "$10,000 deduction at 30% saves $3,000");
assert.equal(leverSavings(-5, 3000), 0);
assert.equal(homeOfficeSimplifiedCents(200), 100_000); assert.equal(homeOfficeSimplifiedCents(500), 150_000, "capped at 300 sq ft");
assert.equal(mileageDeductionCents(1000, 70), 70_000);
assert.equal(projectYear(1_000_000, "2026-07-02"), Math.round((1_000_000 * 365) / 183));
console.log("tax-math: ok");
