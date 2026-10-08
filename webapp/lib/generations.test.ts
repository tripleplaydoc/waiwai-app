import assert from "node:assert/strict";
import { generationsCaption, generationsTotals } from "./generations";

assert.deepEqual(generationsTotals([]), { count: 0, savedCents: 0, targetCents: 0, fraction: 0, allReached: false });
const t = generationsTotals([
  { id: "a", name: "College", savedCents: 50000, targetCents: 200000 },
  { id: "b", name: "Land", savedCents: 300000, targetCents: 100000 }, // over its goal: capped at the goal for progress
  { id: "c", name: "Gift", savedCents: 10000, targetCents: null },   // no goal: counts as saved only
  { id: "d", name: "Negative", savedCents: -500, targetCents: 0 },
]);
assert.equal(t.count, 4);
assert.equal(t.savedCents, 360000);
assert.equal(t.targetCents, 300000);
assert.equal(t.fraction, 150000 / 300000);
assert.equal(t.allReached, false);
const done = generationsTotals([{ id: "a", name: "A", savedCents: 100, targetCents: 100 }]);
assert.equal(done.allReached, true);
assert.equal(done.fraction, 1);
assert.equal(generationsTotals([{ id: "a", name: "A", savedCents: 100, targetCents: null }]).allReached, false);
assert.equal(generationsCaption(generationsTotals([])), "");
assert.match(generationsCaption(generationsTotals([{ id: "a", name: "A", savedCents: 0, targetCents: 100 }])), /seed/);
assert.match(generationsCaption(done), /fully funded/);
assert.match(generationsCaption(done, true), /You did it/);
assert.match(generationsCaption(t), /long view/);
for (const s of [generationsCaption(t), generationsCaption(done)]) assert.doesNotMatch(s, /will be worth|projected|by the year/i);
console.log("generations ok");
