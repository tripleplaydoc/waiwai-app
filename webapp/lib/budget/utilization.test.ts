import assert from "node:assert/strict";
import { utilization } from "./utilization";

const a = utilization(250_000, 1_000_000)!;
assert.equal(a.pct, 25); assert.equal(a.availableCents, 750_000); assert.equal(a.tone, "good"); assert.equal(a.over, false);
assert.equal(utilization(400_000, 1_000_000)!.tone, "ok");
assert.equal(utilization(600_000, 1_000_000)!.tone, "warn");
assert.equal(utilization(900_000, 1_000_000)!.tone, "bad");
const o = utilization(1_200_000, 1_000_000)!;
assert.equal(o.over, true); assert.equal(o.availableCents, 0); assert.equal(o.pct, 120);
assert.equal(utilization(0, 500_000)!.pct, 0);
assert.equal(utilization(100, 0), null);
console.log("utilization tests passed");
