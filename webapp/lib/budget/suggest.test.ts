import assert from "node:assert/strict";
import { MIXED_USE_TYPES, OWNER_DRAW, deductibleShareBps } from "./expense-types";
import { matchRule, rankSuggestions, taxSavingCents, type SuggestPocket } from "./suggest";

const P = (id: string, name: string, expenseType: string | null, extra: Partial<SuggestPocket> = {}): SuggestPocket => ({ id, name, group: "OPEX", expenseType, isTaxDeductible: false, isSystemManaged: false, ...extra });
const pockets = [P("sw", "Software", "SOFTWARE"), P("tr", "Travel", "TRAVEL"), P("ad", "Ads", "ADVERTISING"), P("fd", "Groceries", "FOOD"), P("tx", "Estimated Tax Reserve", "TAXES_LICENSES", { isSystemManaged: true })];

assert.equal(matchRule("Zoom")?.type, "SOFTWARE");
assert.equal(matchRule("Google Ads invoice")?.type, "ADVERTISING", "longest keyword wins over a shorter one");
assert.equal(matchRule("Delta flight to Boston")?.type, "TRAVEL");
assert.equal(matchRule("Deltaville plumbing"), null, "whole words only");
assert.equal(matchRule("zzz nothing"), null);

let r = rankSuggestions({ text: "Zoom", isBusiness: true, pockets, history: [] });
assert.equal(r.suggestions[0].categoryId, "sw"); assert.equal(r.suggestions[0].deductible, true); assert.equal(r.suggestions[0].source, "rule");
// history beats rules
r = rankSuggestions({ text: "Zoom", isBusiness: true, pockets, history: [{ categoryId: "ad", count: 3, exact: true, payee: "Zoom" }] });
assert.equal(r.suggestions[0].categoryId, "ad"); assert.match(r.suggestions[0].reason, /3 times/); assert.equal(r.suggestions[1].categoryId, "sw");
// the system tax reserve is never suggested, even from history
r = rankSuggestions({ text: "irs", isBusiness: true, pockets, history: [{ categoryId: "tx", count: 9, exact: true, payee: "IRS" }] });
assert.equal(r.suggestions.length, 0);
// no pocket of the type yet -> hint
r = rankSuggestions({ text: "Staples", isBusiness: true, pockets, history: [] });
assert.equal(r.suggestions.length, 0); assert.equal(r.hint?.typeKey, "OFFICE"); assert.equal(r.hint?.missing, true);
// personal workspace: never marked deductible
r = rankSuggestions({ text: "Zoom", isBusiness: false, pockets, history: [] });
assert.equal(r.suggestions[0].deductible, false);
// deductible flag on a pocket outside business types
r = rankSuggestions({ text: "Safeway", isBusiness: true, pockets: [P("x", "Client gifts", "FOOD", { isTaxDeductible: true })], history: [{ categoryId: "x", count: 1, exact: false, payee: "Safeway" }] });
assert.equal(r.suggestions[0].deductible, true);
// pocket name in the text
r = rankSuggestions({ text: "monthly software tool", isBusiness: true, pockets, history: [] });
assert.equal(r.suggestions[0].categoryId, "sw");
assert.equal(rankSuggestions({ text: "a", isBusiness: true, pockets, history: [] }).suggestions.length, 0);
assert.equal(taxSavingCents(9000, 3000), 2700, "$90 at 30% saves $27"); assert.equal(taxSavingCents(-5, 3000), 0);
assert.equal(deductibleShareBps("MEALS"), 5000, "meals are generally 50% deductible");
assert.equal(deductibleShareBps("SOFTWARE"), 10000); assert.equal(deductibleShareBps(null), 10000);
assert.ok(MIXED_USE_TYPES.includes("UTILITIES") && !MIXED_USE_TYPES.includes("MEALS")); assert.equal(OWNER_DRAW, "OWNER_DRAW");
console.log("suggest: ok");
