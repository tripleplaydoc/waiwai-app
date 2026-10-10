import assert from "node:assert/strict";
import { buildMoves, inverseRows, undoNote, undoProblem, undoTargetOf, type MoveRow, type MoveTransfer } from "./moves-math";

const names = new Map([["ven", "Venmo"], ["sofi", "SoFi Checking"], ["sav", "SoFi Savings"]]);
const row = (p: Partial<MoveRow> & Pick<MoveRow, "categoryId" | "amountCents" | "createdAtMs">): MoveRow => ({
  id: Math.random().toString(36).slice(2), categoryName: p.categoryId, fundingAccountId: "sav", month: "2026-10-01", source: "MANUAL", note: null, ...p,
});

// A pocket move: $0.11 Long Term -> Groceries, held in SoFi Savings.
const move = [
  row({ categoryId: "Long Term", amountCents: -11, createdAtMs: 1000, note: "Moved to Groceries" }),
  row({ categoryId: "Groceries", amountCents: 11, createdAtMs: 1000, note: "Moved from Long Term" }),
];
let log = buildMoves(move, [], names);
assert.equal(log.length, 1);
assert.equal(log[0].kind, "pocket");
assert.equal(log[0].cents, 11);
assert.match(log[0].title, /Moved \$0\.11 from Long Term to Groceries/);
assert.ok(log[0].canUndo);

// Undoing adds exact opposites with a note that points back at the move.
const inv = inverseRows(move, "1000");
assert.deepEqual(inv.map((r) => r.amountCents).sort((a, b) => a - b), [-11, 11]);
assert.equal(inv.find((r) => r.categoryId === "Groceries")!.amountCents, -11);
assert.equal(undoTargetOf(inv[0].note), "1000");
assert.equal(undoNote("1000", "Moved to Groceries"), "Undo of 1000: Moved to Groceries");

// Once the undo rows are in the ledger, the move shows as undone and the undo cannot be undone.
const undoRows = inv.map((r, i) => row({ ...r, id: `u${i}`, categoryName: r.categoryId, source: "CORRECTION", createdAtMs: 2000 }));
log = buildMoves([...move, ...undoRows], [], names);
assert.equal(log.length, 2);
assert.equal(log[0].kind, "undo");
assert.equal(log[0].canUndo, false);
assert.match(log[0].title, /^Undid: Moved \$0\.11 from Long Term to Groceries/);
assert.equal(log[1].undone, true);
assert.equal(log[1].canUndo, false);

// A transfer with labels merges with its transfer; the labels follow the receiving account.
const labels = [
  row({ categoryId: "Tithing", amountCents: -2650, fundingAccountId: "ven", source: "CORRECTION", createdAtMs: 5000, note: "Directed with transfer to SoFi Checking" }),
  row({ categoryId: "Tithing", amountCents: 2650, fundingAccountId: "sofi", source: "CORRECTION", createdAtMs: 5000, note: "Directed with transfer to SoFi Checking" }),
];
const tr: MoveTransfer = { groupId: "g1", fromId: "ven", toId: "sofi", fromName: "Venmo", toName: "SoFi Checking", cents: 7950, date: "2026-10-09", createdAtMs: 4800 };
log = buildMoves(labels, [tr], names);
assert.equal(log.length, 1);
assert.equal(log[0].transferGroupId, "g1");
assert.match(log[0].title, /Transferred \$79\.50 from Venmo to SoFi Checking/);
assert.ok(log[0].lines.some((l) => /Tithing: \$26\.50 now held in SoFi Checking/.test(l)));

// A transfer that moved no labels still shows, keyed by its group.
log = buildMoves([], [tr], names);
assert.equal(log.length, 1);
assert.equal(log[0].key, "t:g1");
assert.equal(log[0].canUndo, true);

// A transfer far apart in time is not merged.
log = buildMoves(labels, [{ ...tr, createdAtMs: 999999 }], names);
assert.equal(log.length, 2);

// Rebalance, held-in and fixes are listed; ordinary assigning and flow rows are not.
const retag = (note: string, source = "CORRECTION") => [
  row({ categoryId: "CASH", amountCents: -500, fundingAccountId: "sav", source, createdAtMs: 7000, note }),
  row({ categoryId: "CASH", amountCents: 500, fundingAccountId: "ven", source, createdAtMs: 7000, note }),
];
assert.equal(buildMoves(retag("Rebalanced: SoFi Savings to Venmo"), [], names)[0].kind, "rebalance");
assert.equal(buildMoves(retag("Held in set: A to B"), [], names)[0].kind, "heldin");
const fix = buildMoves(retag("Balance fix: Cash Reservoir $30,000"), [], names)[0];
assert.equal(fix.kind, "fix");
assert.match(fix.title, /^Fix: Cash Reservoir/);
assert.equal(buildMoves([row({ categoryId: "X", amountCents: 5000, createdAtMs: 9, note: null })], [], names).length, 0);
assert.equal(buildMoves([row({ categoryId: "X", amountCents: 5000, createdAtMs: 9, source: "AUTO_WATERFALL", note: "Flow" })], [], names).length, 0);

// Safety: undoing needs the money to still be there.
const held = new Map([["Groceries", new Map([["sav", 11]])], ["Long Term", new Map([["sav", 437]])]]);
const pocketNames = new Map([["Groceries", "Groceries"], ["Long Term", "Long Term"]]);
const pools = new Map<string | null, number>([["sav", 0]]);
assert.equal(undoProblem({ inverse: inv, names, pocketNames, held, pools }), null);
const spent = new Map([["Groceries", new Map([["sav", 4]])]]);
assert.match(undoProblem({ inverse: inv, names, pocketNames, held: spent, pools })!, /Groceries no longer holds \$0\.11 in SoFi Savings/);

// Putting released money back needs free cash in that account.
const released = inverseRows([row({ categoryId: "Tithing", amountCents: -2000, createdAtMs: 3, note: "Moved back to the pool" })], "3");
assert.match(undoProblem({ inverse: released, names, pocketNames, held, pools: new Map([["sav", 500]]) })!, /SoFi Savings with \$15\.00 less free cash/);
assert.equal(undoProblem({ inverse: released, names, pocketNames, held, pools: new Map([["sav", 2500]]) }), null);

// Deleting a transfer takes cash out of the receiving account; it must still have it.
const txOnly = inverseRows([], "t:g1");
assert.equal(undoProblem({ inverse: txOnly, names, pocketNames, held, pools: new Map([["sofi", 100]]), txPoolDelta: new Map([["sofi", -7950], ["ven", 7950]]) })?.includes("SoFi Checking"), true);
assert.equal(undoProblem({ inverse: txOnly, names, pocketNames, held, pools: new Map([["sofi", 9000]]), txPoolDelta: new Map([["sofi", -7950], ["ven", 7950]]) }), null);
// An account that was already below zero is not blamed for what it already was.
assert.equal(undoProblem({ inverse: [], names, pocketNames, held, pools: new Map([["sofi", -100]]), txPoolDelta: new Map([["ven", 500]]) }), null);

console.log("moves-math ok");
