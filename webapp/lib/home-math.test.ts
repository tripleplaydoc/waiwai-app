import assert from "node:assert/strict";
import { billStep, buildWins, cardCloseStep, cardDueStep, gapStep, greeting, money, orderSteps, recurringStep, sortStep, whenWords } from "./home-math";

assert.equal(greeting(9, "Mike"), "Good morning, Mike.");
assert.equal(greeting(14, " "), "Good afternoon.");
assert.equal(greeting(20, "Mike"), "Good evening, Mike.");
assert.equal(money(-34810), "$348.10");
assert.equal(whenWords(0, "2026-10-05"), "today");
assert.equal(whenWords(1, "2026-10-06"), "tomorrow");
assert.equal(whenWords(9, "2026-10-14"), "on Oct 14");

const base = { weekChangeCents: null, comingInCents: 0, readyToAssignCents: 0, cardUse: [], billsPaid: 0, billsTotal: 0, noOverspent: false, allSorted: false, activeDays: 0 };
assert.deepEqual(buildWins(base).map((w) => w.key), ["one-place"], "nothing true => one plain line");
assert.equal(buildWins({ ...base, weekChangeCents: -500 }).length, 1, "a drop is not a win");
const w = buildWins({ ...base, weekChangeCents: 15000, comingInCents: 500000, readyToAssignCents: 12000, cardUse: [{ name: "Chase", pct: 22 }, { name: "Amex", pct: 41 }], billsPaid: 4, billsTotal: 6, noOverspent: true, allSorted: true, activeDays: 5 });
assert.equal(w.length, 4);
assert.equal(w[0].text, "$150.00 more across your accounts than a week ago");
assert.ok(!w.some((x) => x.text.includes("Amex")), "a card over 30% is not celebrated");
assert.equal(buildWins({ ...base, billsPaid: 6, billsTotal: 6 })[0].text, "All 6 recurring flows are handled this month");
assert.equal(buildWins({ ...base, activeDays: 2 })[0].key, "one-place");

const s = cardCloseStep({ id: "c1", name: "Chase Sapphire", payDownCents: 130000, payByDays: 1, payByIso: "2026-10-06", reportedPct: 9, href: "/accounts/c1" });
assert.equal(s.title, "Chase Sapphire: a $1,300.00 payment tomorrow");
assert.match(s.detail, /9%/);
assert.equal(cardDueStep({ id: "c1", name: "Amex", owedCents: 520000, dueDays: 9, dueIso: "2026-10-14", href: "/x" }).title, "Amex: $5,200.00 due on Oct 14");
assert.equal(recurringStep({ payee: "Payroll tax", amountCents: -80000, href: "/r" }).title, "Payroll tax is ready to post");
assert.equal(sortStep(1, "/a").title, "1 quick sort");
assert.equal(billStep({ id: "b", label: "Rent", cents: 150000, days: -2, iso: "2026-10-03", late: true, href: "/b" }).title, "Rent: $1,500.00 is waiting for you");
const g = gapStep({ cents: 34810, iso: "2026-11-14", days: 40 });
assert.equal(g.title, "A $348.10 gap to plan for around Nov 14");
assert.match(g.detail, /40 days to arrange/);
assert.deepEqual(orderSteps([g, s, sortStep(2, "/a")]).map((x) => x.key.split("-")[0]), ["close", "sort", "gap"]);
for (const x of [g, s, sortStep(1, "/a"), recurringStep({ payee: "x", amountCents: 1, href: "/" }), billStep({ id: "b", label: "R", cents: 1, days: -1, iso: "2026-10-03", late: true, href: "/" })]) {
  assert.ok(!/overdue|warning|alert|urgent|short/i.test(`${x.title} ${x.detail}`), `alarm word in: ${x.title}`);
}
console.log("home-math ok");
