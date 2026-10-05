import assert from "node:assert/strict";
import { balanceAfter, loanDueIso, loanStatus, paymentsFor, suggestPayment, type LoanTerms } from "./loans";

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
assert.equal(paymentsFor(40000, 5348, 0), 8, "400 at 53.48 -> 8 payments (last one smaller)");
assert.equal(paymentsFor(40000, 10000, 0), 4); assert.equal(paymentsFor(0, 100, 0), 0); assert.equal(paymentsFor(100, 0, 0), null);
assert.equal(paymentsFor(100000, 8885, 1200), 12, "12% loan paid by its own payment");
assert.equal(paymentsFor(100000, 500, 1200), null, "payment below the interest never clears it");
// a loan entered mid-cycle: anchored at the next due date with the balance as its amount
const mid: LoanTerms = { paymentCents: 5348, numPayments: 8, firstDueIso: "2026-10-22", aprBps: 0, originalCents: 40000 };
s = loanStatus(mid, "2026-10-05", false);
assert.equal(s.paymentsLeft, 8); assert.equal(s.nextDueIso, "2026-10-22"); assert.equal(s.lastDueIso, "2027-05-22"); assert.equal(s.phase, "active");
s = loanStatus({ ...mid, firstDueIso: "2026-11-22" }, "2026-10-05", false); // this month's already paid: next is November
assert.equal(s.phase, "upcoming"); assert.equal(s.paymentsLeft, 8);
console.log("loans-budget: ok");
