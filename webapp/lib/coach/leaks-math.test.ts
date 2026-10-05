import assert from "node:assert/strict";
import { analyzeLeaks, negotiationScript, payeeKey } from "./leaks-math";

const m = (payee: string, dates: string[], cents: number[] | number): { payee: string; date: string; cents: number }[] =>
  dates.map((date, i) => ({ payee, date, cents: Array.isArray(cents) ? cents[i] : cents }));
const monthly = (start: string, n: number) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1 + i, 5)); return d.toISOString().slice(0, 10); });

assert.equal(payeeKey("ZOOM.US 888-799-9666 CA"), "zoom us ca");
assert.equal(payeeKey("Zoom"), "zoom");

const spends = [
  ...m("Zoom", monthly("2026-01-01", 10), [1599, 1599, 1599, 1599, 1599, 1599, 1599, 1599, 1999, 1999]),
  ...m("Netflix", monthly("2026-01-01", 10), 1549),
  ...m("Adobe", monthly("2026-01-01", 10), 5499),
  ...m("Canva", monthly("2026-01-01", 10), 1500),
  ...m("Foodland", ["2026-03-02", "2026-03-19", "2026-04-30", "2026-06-11"], [8417, 5233, 9120, 4410]),
  ...m("State Farm", ["2025-10-12", "2026-10-12"], [120000, 138000]),
  ...m("Old Gym", ["2026-01-03", "2026-02-03", "2026-03-03"], 3000),
];
const r = analyzeLeaks(spends, "2026-10-05");
assert.ok(r.recurring.some((x) => x.key === "zoom" && x.cadence === "monthly"), "monthly subscription found");
assert.ok(!r.recurring.some((x) => x.key === "foodland"), "irregular grocery trips are not recurring");
assert.ok(!r.recurring.some((x) => x.key === "old gym"), "a subscription that stopped is not active");
const zoom = r.creeping.find((x) => x.key === "zoom")!;
assert.deepEqual([zoom.creep!.fromCents, zoom.creep!.toCents, zoom.creep!.perYearCents, zoom.creep!.pct], [1599, 1999, 4800, 25], "price rise and its yearly cost");
assert.ok(r.recurring.some((x) => x.key === "state farm" && x.cadence === "yearly"), "yearly bill found from two charges");
assert.ok(r.overlaps.some((o) => o.typeKey === "SOFTWARE" && o.payees.length >= 3), "three software subscriptions overlap");
assert.ok(r.subscriptionMonthlyCents >= 1999 + 1549 + 5499 + 1500);

const d = analyzeLeaks([...m("Hotels Co", ["2026-09-20", "2026-09-21"], 25000)], "2026-10-05");
assert.equal(d.doubles.length, 1, "same amount twice in a day or two is flagged");
assert.ok(negotiationScript("INSURANCE", "State Farm", 15).includes("re-quote"));
console.log("leaks-math: ok");
