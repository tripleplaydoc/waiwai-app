import assert from "node:assert/strict";
import { expandTaxMoves, expandCoverDraws } from "./tax-split-math";

const splits = [{ id: "tN", accountId: "N" }, { id: "tF", accountId: "F" }];
const pools = new Map<string | null, number>([["N", 300000], ["F", 100000]]);

// taxes split 3:1 by cash held; other moves untouched
const moves = [{ categoryId: "tax", cents: 1000, kind: "TAXES" as const }, { categoryId: "opex", cents: 500, kind: "OPEX" as const }];
const e = expandTaxMoves(moves, "tax", splits, pools);
assert.deepEqual(e.filter((m) => m.kind === "TAXES").map((m) => [m.categoryId, m.cents]), [["tN", 750], ["tF", 250]]);
assert.equal(e.find((m) => m.kind === "OPEX")!.cents, 500);
assert.equal(e.filter((m) => m.kind === "TAXES").reduce((s, m) => s + m.cents, 0), 1000);

// odd cents still add up
const odd = expandTaxMoves([{ categoryId: "tax", cents: 1001, kind: "TAXES" }], "tax", splits, pools);
assert.equal(odd.reduce((s, m) => s + m.cents, 0), 1001);

// no cash in either account: left on the main pocket
assert.equal(expandTaxMoves([{ categoryId: "tax", cents: 100, kind: "TAXES" }], "tax", splits, new Map())[0].categoryId, "tax");
// no splits: unchanged
assert.deepEqual(expandTaxMoves(moves, "tax", [], pools), moves);

// cover: spread over pockets by what they hold, never over a pocket's balance
const draws = [{ bucket: "TAXES" as const, fromId: "tax", toId: "o", toName: "Rent", cents: 400 }];
const c = expandCoverDraws(draws, "tax", [{ id: "tN", balanceCents: 300 }, { id: "tF", balanceCents: 100 }, { id: "tax", balanceCents: 0 }]);
assert.deepEqual(c.map((d) => [d.fromId, d.cents]), [["tN", 300], ["tF", 100]]);
const c2 = expandCoverDraws(draws, "tax", [{ id: "tN", balanceCents: 100 }, { id: "tF", balanceCents: 100 }]);
assert.equal(c2.reduce((s, d) => s + d.cents, 0), 400); // 200 from pockets + 200 left on main (caller sees it as before)
console.log("tax-split: ok");
