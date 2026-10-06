import assert from "node:assert/strict";
import { addDays, buildForecast, cardEvents, daysBetween, monthlyDates, occurrences, type ForecastEvent } from "./forecast-math";

const ev = (date: string, cents: number, id = "x"): ForecastEvent => ({ id, date, dueDate: date, label: id, cents, kind: "recurring" });

// dates
assert.equal(addDays("2026-10-05", 60), "2026-12-04");
assert.equal(addDays("2026-12-31", 1), "2027-01-01");
assert.equal(daysBetween("2026-10-05", "2026-10-08"), 3);
assert.deepEqual(monthlyDates(31, "2027-01-15", "2027-04-10"), ["2027-01-31", "2027-02-28", "2027-03-31"]);
assert.deepEqual(monthlyDates(5, "2026-10-05", "2026-12-04"), ["2026-10-05", "2026-11-05"]);
assert.deepEqual(monthlyDates(5, "2026-10-06", "2026-12-04"), ["2026-11-05"]);

// balance walk
{
  const f = buildForecast({ today: "2026-10-05", horizon: 10, startCents: 100_000, events: [ev("2026-10-08", -150_000, "rent"), ev("2026-10-12", 200_000, "pay"), ev("2026-10-20", -5, "later")] });
  assert.equal(f.days.length, 11);
  assert.equal(f.days[0].balanceCents, 100_000);
  assert.equal(f.days[3].balanceCents, -50_000);
  assert.deepEqual(f.firstShort, { date: "2026-10-08", cents: -50_000 });
  assert.deepEqual(f.low, { date: "2026-10-08", cents: -50_000 });
  assert.equal(f.endCents, 150_000, "events after the horizon are left out");
  assert.equal(f.inCents, 200_000);
  assert.equal(f.outCents, 150_000);
}
// overdue things count today; income sorts before spending on the same day
{
  const f = buildForecast({ today: "2026-10-05", horizon: 3, startCents: 0, events: [ev("2026-10-01", -1000, "late"), ev("2026-10-05", 5000, "pay")] });
  assert.equal(f.days[0].events.length, 2);
  assert.equal(f.days[0].events[0].id, "pay");
  assert.equal(f.days[0].balanceCents, 4000);
  assert.equal(f.firstShort, null);
  assert.equal(f.low.cents, 4000);
}

// repeating occurrences
{
  const o = occurrences("2026-10-20", "MONTHLY", 20, "2026-10-05", "2026-12-04", null);
  assert.deepEqual(o.map((x) => x.date), ["2026-10-20", "2026-11-20"]);
  const late = occurrences("2026-09-28", "WEEKLY", 28, "2026-10-05", "2026-10-20", null);
  assert.deepEqual(late.map((x) => x.date), ["2026-10-05", "2026-10-05", "2026-10-12", "2026-10-19"]);
  assert.equal(late[0].dueDate, "2026-09-28");
  const ended = occurrences("2026-10-10", "WEEKLY", 10, "2026-10-05", "2026-12-04", "2026-10-24");
  assert.deepEqual(ended.map((x) => x.date), ["2026-10-10", "2026-10-17", "2026-10-24"]);
}

// card: owed 1,300 on a 10,000 limit (target 900): pay 400 before close, the rest at the due date
{
  const e = cardEvents({ id: "c1", name: "Chase", owedCents: 130_000, limitCents: 1_000_000, statementDay: 8, dueDay: 3, charges: [], today: "2026-10-05", end: "2026-12-04" });
  assert.deepEqual(e.map((x) => [x.date, x.cents]), [["2026-10-06", -40_000], ["2026-11-03", -90_000]]);
  assert.equal(e[0].dueDate, "2026-10-06");
}
// a charge in between is paid with the next cycle; a charge before the due date is part of that payment
{
  const e = cardEvents({ id: "c1", name: "Chase", owedCents: 0, limitCents: null, statementDay: null, dueDay: 15, charges: [{ date: "2026-10-10", cents: 5_000 }, { date: "2026-11-10", cents: 7_000 }], today: "2026-10-05", end: "2026-12-04" });
  assert.deepEqual(e.map((x) => [x.date, x.cents]), [["2026-10-15", -5_000], ["2026-11-15", -7_000]]);
}
// pay-by already passed but the statement hasn't closed: pay today
{
  const e = cardEvents({ id: "c1", name: "Amex", owedCents: 50_000, limitCents: 500_000, statementDay: 6, dueDay: null, charges: [], today: "2026-10-05", end: "2026-10-20" });
  assert.deepEqual(e.map((x) => [x.date, x.cents, x.dueDate]), [["2026-10-05", -5_000, "2026-10-04"]]);
}
// nothing owed, nothing to pay
assert.deepEqual(cardEvents({ id: "c", name: "Z", owedCents: 0, limitCents: 100_000, statementDay: 8, dueDay: 3, charges: [], today: "2026-10-05", end: "2026-12-04" }), []);

console.log("forecast-math ok");
