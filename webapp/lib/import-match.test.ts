import { parseBankCsv, parseDate } from "./csv";
import assert from "node:assert/strict";
import { matchExisting } from "./import-match";

const ex = [{ id: "a", date: "2026-10-02", amountCents: -8417 }, { id: "b", date: "2026-10-03", amountCents: 240000 }];
assert.deepEqual(matchExisting([{ date: "2026-10-03", amountCents: -8417 }, { date: "2026-10-03", amountCents: 240000 }, { date: "2026-10-04", amountCents: -999 }], ex), [true, true, false]);
// Too far apart, or the same typed-in transaction can't explain two statement rows.
assert.deepEqual(matchExisting([{ date: "2026-10-09", amountCents: -8417 }], ex), [false]);
assert.deepEqual(matchExisting([{ date: "2026-10-02", amountCents: -8417 }, { date: "2026-10-02", amountCents: -8417 }], ex), [true, false]);
console.log("import-match tests passed");

// bank exports with MM-DD-YYYY dates and "-$3,700.00" amounts
{
  assert.equal(parseDate("10-05-2026"), "2026-10-05");
  assert.equal(parseDate("2/3/26"), "2026-02-03");
  const r = parseBankCsv('Date,Description,Amount,Note,Check Number, Category\n10-05-2026,NETLIFY,"-$5.00",,,Software\n09-03-2019,PAYPAL,"$0.17",,,Other\n');
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.rows.map((x) => [x.date, x.amountCents]), [["2026-10-05", -500], ["2019-09-03", 17]]);
}
