import assert from "node:assert/strict";
import { OLELO, dayOfYear, oleloFor } from "./olelo";

assert.equal(dayOfYear("2026-01-01"), 1);
assert.equal(dayOfYear("2026-12-31"), 365);
assert.equal(dayOfYear("2028-12-31"), 366);
assert.equal(dayOfYear("2026-10-07"), 280);
assert.equal(oleloFor("2026-01-01"), OLELO[0]);
assert.equal(oleloFor("2026-01-02"), OLELO[1]);
assert.equal(oleloFor("2026-01-05"), OLELO[0]);
assert.equal(oleloFor("2026-10-07"), OLELO[(280 - 1) % OLELO.length]);
// same day, same proverb; every proverb gets a turn within a few days
assert.equal(oleloFor("2026-10-07"), oleloFor("2026-10-07"));
assert.equal(new Set(Array.from({ length: OLELO.length }, (_, i) => oleloFor(`2026-03-${String(i + 1).padStart(2, "0")}`).haw)).size, OLELO.length);
// exact text of the verified proverbs (ʻokina U+02BB, kahakō) must not drift
assert.deepEqual(OLELO.map((o) => o.haw), ["ʻAʻohe hana nui ke alu ʻia.", "He aliʻi ka ʻāina; he kauwā ke kanaka.", "Ma ka hana ka ʻike.", "I ka wā ma mua, i ka wā ma hope."]);
for (const o of OLELO) { assert.ok(o.en && o.reflection); assert.ok(!o.haw.includes("'") && !o.haw.includes("‘") && !o.haw.includes("’")); }
console.log("olelo ok");
