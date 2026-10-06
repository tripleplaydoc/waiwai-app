import assert from "node:assert/strict";
import { HOME_IDS, normalizeLayout, parseLayout } from "./home-layout";

assert.deepEqual(normalizeLayout(null, null), { order: HOME_IDS, hidden: [] });
const l = normalizeLayout(["steps", "bogus", "cash", "steps"], ["wins", "nope", "wins"]);
assert.deepEqual(l.order.slice(0, 2), ["steps", "cash"]);
assert.equal(l.order.length, HOME_IDS.length);
assert.deepEqual(l.hidden, ["wins"]);
assert.deepEqual(parseLayout("not json"), normalizeLayout(null, null));
assert.deepEqual(parseLayout(JSON.stringify({ order: ["budget"], hidden: ["verse"] })).order[0], "budget");
console.log("home-layout ok");
