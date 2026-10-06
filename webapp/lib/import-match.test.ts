import assert from "node:assert/strict";
import { matchExisting } from "./import-match";

const ex = [{ id: "a", date: "2026-10-02", amountCents: -8417 }, { id: "b", date: "2026-10-03", amountCents: 240000 }];
assert.deepEqual(matchExisting([{ date: "2026-10-03", amountCents: -8417 }, { date: "2026-10-03", amountCents: 240000 }, { date: "2026-10-04", amountCents: -999 }], ex), [true, true, false]);
// Too far apart, or the same typed-in transaction can't explain two statement rows.
assert.deepEqual(matchExisting([{ date: "2026-10-09", amountCents: -8417 }], ex), [false]);
assert.deepEqual(matchExisting([{ date: "2026-10-02", amountCents: -8417 }, { date: "2026-10-02", amountCents: -8417 }], ex), [true, false]);
console.log("import-match tests passed");
