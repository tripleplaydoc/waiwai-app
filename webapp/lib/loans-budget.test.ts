import assert from "node:assert/strict";
import { balanceAfter, loanDueIso, loanStatus, suggestPayment, type LoanTerms } from "./loans";

assert.equal(loanDueIso("2026-01-31", 1), "2026-02-28", "day clamps in short months");
assert.equal(loanDueIso("2026-01-31", 2), "2026-03-31", "and returns to the 31st");
assert.equal(loanDueIso("2026-11-15", 2), "2027-01-15", "crosses the year");

const t: LoanTerms = { paymentCents: 10000, numPayments: 6, firstDueIso: "2026-08-15", aprBps: 0, originalCents: 60000 };
// Aug, Sep done (earlier months); Oct payment unpaid
let s = loanStatus(t, "2026-10-05", false);
assert.equal(s.paymentsDone, 2); assert.equal(s.paymentsLeft, 4); assert.equal(s.thisMonthNumber, 3);
assert.equal(s.nextDueIso, "2026-10-15"); assert.equal(s.phase, "active"); assert.equal(s.remainingCents, 40000);
s = loanStatus(t, "2026-10-05", true);
assert.equal(s.paymentsDone, 3); assert.equal(s.paymentsLeft, 3); assert.equal(s.nextDueIso, "2026-11-15");
assert.equal(s.lastDueIso, "2027-01-15");
// not started
s = loanStatus({ ...t, firstDueIso: "2026-11-15" }, "2026-10-05", false);
assert.equal(s.phase, "upcoming"); assert.equal(s.paymentsDone, 0); assert.equal(s.nextDueIso, "2026-11-15"); assert.equal(s.thisMonthNumber, null);
// finished: last payment month has passed
s = loanStatus(t, "2027-02-02", false);
assert.equal(s.phase, "finished"); assert.equal(s.paymentsLeft, 0); assert.equal(s.nextDueIso, null);
// last payment this month, paid -> finished
s = loanStatus(t, "2027-01-20", true);
assert.equal(s.phase, "finished");
// last payment this month, unpaid -> still active, 1 left
s = loanStatus(t, "2027-01-02", false);
assert.equal(s.paymentsLeft, 1); assert.equal(s.nextDueIso, "2027-01-15");

assert.equal(balanceAfter(t, 0), 60000); assert.equal(balanceAfter(t, 2), 40000); assert.equal(balanceAfter(t, 99), 0);
assert.equal(suggestPayment(60000, 6, 0), 10000); assert.equal(suggestPayment(100000, 3, 0), 33334, "rounds up so the loan clears");
const apr = suggestPayment(100000, 12, 1200);
assert.ok(apr > 8333 && apr < 8900, `1000 at 12% over 12 months is about 88.85, got ${apr}`);
console.log("loans-budget: ok");
