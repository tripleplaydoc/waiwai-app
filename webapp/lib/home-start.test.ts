import assert from "node:assert/strict";
import { startProgress, startSteps } from "./home-start";
import { cashTrend } from "./home-trend";

const none = startSteps({ accounts: 0, pockets: 0, assignments: 0, transactions: 0 });
assert.deepEqual(startProgress(none), { done: 0, total: 4, complete: false });
const some = startSteps({ accounts: 1, pockets: 5, assignments: 0, transactions: 0 }, "?ws=business");
assert.equal(startProgress(some).done, 2);
assert.equal(some[0].href, "/accounts?ws=business");
assert.equal(startProgress(startSteps({ accounts: 1, pockets: 1, assignments: 1, transactions: 1 })).complete, true);

const t = cashTrend(1000, [{ date: "2026-10-07", cents: 200 }, { date: "2026-10-05", cents: -300 }], "2026-10-07", 3);
assert.deepEqual(t, [1100, 800, 800, 1000]); // Oct 4..7: Oct 5 spent 300, Oct 7 received 200
console.log("home-start ok");
