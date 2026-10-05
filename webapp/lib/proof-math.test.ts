import assert from "node:assert/strict";
import { diagnoseGap, proofFor } from "./proof-math";

const tx = (id: string, date: string, amountCents: number, payee: string, cleared = true) => ({ id, date, amountCents, payee, cleared });

// exact match
assert.equal(diagnoseGap({ bankCents: 1000, appCents: 1000, today: "2026-10-05", txs: [] }).state, "match");

// pending entries explain the gap: bank has more than app by the uncleared outflow
const p = diagnoseGap({ bankCents: 10000, appCents: 7500, today: "2026-10-05", txs: [tx("a", "2026-10-04", -2500, "Cafe", false)] });
assert.equal(p.state, "pending");

// missing deposit
const m = diagnoseGap({ bankCents: 60000, appCents: 10000, today: "2026-10-05", txs: [tx("a", "2026-09-01", -2000, "Shop")] });
assert.equal(m.state, "off"); assert.equal(m.gapCents, 50000);
assert.ok(m.hints[0].includes("$500.00 deposit"));

// same size as the gap but wrong direction
const w = diagnoseGap({ bankCents: 10000, appCents: 5000, today: "2026-10-05", txs: [tx("a", "2026-09-20", -5000, "Rent")] });
assert.ok(w.suspects.some((s) => s.id === "a"));

// flipped sign: gap is double
const f = diagnoseGap({ bankCents: 0, appCents: 3000, today: "2026-10-05", txs: [tx("a", "2026-09-20", 1500, "Refund")] });
assert.ok(f.suspects.some((s) => s.reason.includes("flipped")));

// divisible by 9
const n = diagnoseGap({ bankCents: 0, appCents: 2700, today: "2026-10-05", txs: [] });
assert.ok(n.hints.some((h) => h.includes("divides evenly by 9")));

// proof line
assert.equal(proofFor(null, "2026-10-05").state, "never");
assert.equal(proofFor({ date: "2026-10-04", gapCents: 0, adjustedCents: 0 }, "2026-10-05").state, "matched");
assert.equal(proofFor({ date: "2026-09-01", gapCents: 0, adjustedCents: 0 }, "2026-10-05").state, "stale");
assert.equal(proofFor({ date: "2026-10-04", gapCents: 500, adjustedCents: 500 }, "2026-10-05").state, "matched");
assert.equal(proofFor({ date: "2026-10-04", gapCents: 500, adjustedCents: 0 }, "2026-10-05").state, "off");
console.log("proof-math: ok");
const d = diagnoseGap({ bankCents: 7500, appCents: 5000, today: "2026-10-05", txs: [tx("x", "2026-09-10", -2500, "Gym"), tx("y", "2026-09-11", -2500, "Gym")] });
assert.ok(d.suspects.some((s) => s.reason === "Possible duplicate"));
const d2 = diagnoseGap({ bankCents: 0, appCents: 2500, today: "2026-10-05", txs: [tx("x", "2026-09-10", 2500, "Pay"), tx("y", "2026-09-11", 2500, "Pay")] });
assert.ok(d2.suspects.some((s) => s.reason === "Possible duplicate"));
console.log("proof-math dup: ok");
