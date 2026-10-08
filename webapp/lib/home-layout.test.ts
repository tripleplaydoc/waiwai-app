import assert from "node:assert/strict";
import { HOME_IDS, normalizeLayout, parseLayout } from "./home-layout";

assert.deepEqual(normalizeLayout(null, null), { order: HOME_IDS, hidden: [] });
const l = normalizeLayout(["steps", "bogus", "cash", "steps"], ["wins", "nope", "wins"]);
assert.deepEqual(l.order.slice(0, 2), ["steps", "cash"]);
assert.equal(l.order.length, HOME_IDS.length);
assert.deepEqual(l.hidden, ["wins"]);
assert.deepEqual(parseLayout("not json"), normalizeLayout(null, null));
assert.deepEqual(parseLayout(JSON.stringify({ order: ["budget"], hidden: ["verse"] })).order[0], "budget");
// new sections land right after their default neighbour, also for layouts saved before they existed
assert.equal(HOME_IDS[HOME_IDS.indexOf("cash") + 1], "stewardship");
assert.equal(HOME_IDS.indexOf("stewardship") < HOME_IDS.indexOf("wins"), true);
const old = normalizeLayout(["budget", "steps", "cash", "wins", "verse", "ahead", "prepare"], ["ahead"]);
assert.equal(old.order[old.order.indexOf("cash") + 1], "stewardship");
assert.deepEqual(old.order.slice(old.order.indexOf("cash"), old.order.indexOf("cash") + 4), ["cash", "stewardship", "flow", "generations"]);
assert.equal(new Set(old.order).size, HOME_IDS.length);
assert.deepEqual(old.hidden, ["ahead"]);
assert.deepEqual(old.order.slice(0, 2), ["budget", "steps"]);
console.log("home-layout ok");
