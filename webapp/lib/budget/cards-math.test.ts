import { computeCardShortfalls, splitByWeight } from "./cards-math";

let failed = 0;
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { failed++; console.error(`FAIL ${name}\n  got      ${JSON.stringify(a)}\n  expected ${JSON.stringify(b)}`); } else console.log(`ok   ${name}`);
};

eq("split exact", splitByWeight(100, [1, 1, 1]), [34, 33, 33]);
eq("split sums", splitByWeight(101, [3, 5, 7]).reduce((s, v) => s + v, 0), 101);
eq("split zero", splitByWeight(0, [1, 2]), [0, 0]);

const pockets = [
  { id: "food", name: "Groceries", availableCents: 5000 },
  { id: "fun", name: "Fun", availableCents: -3500 },
  { id: "gas", name: "Gas", availableCents: -1000 },
];
const owed = { visa: 124000, amex: 50000 };

let r = computeCardShortfalls({ pockets, spend: [{ cardId: "visa", categoryId: "food", spentCents: 20000 }], uncategorized: {}, owedCents: owed });
eq("funded spending is not short", [r.visa.shortCents, r.amex.shortCents], [0, 0]);

r = computeCardShortfalls({ pockets, spend: [{ cardId: "visa", categoryId: "fun", spentCents: 8500 }], uncategorized: {}, owedCents: owed });
eq("overspent on card is short", [r.visa.shortCents, r.visa.parts], [3500, [{ categoryId: "fun", name: "Fun", cents: 3500 }]]);

r = computeCardShortfalls({ pockets, spend: [{ cardId: "visa", categoryId: "fun", spentCents: 1000 }], uncategorized: {}, owedCents: owed });
eq("short capped at what was charged to the card (rest was cash)", r.visa.shortCents, 1000);

r = computeCardShortfalls({ pockets, spend: [{ cardId: "visa", categoryId: "fun", spentCents: 3000 }, { cardId: "amex", categoryId: "fun", spentCents: 1000 }], uncategorized: {}, owedCents: owed });
eq("shared overspend splits by share", [r.visa.shortCents, r.amex.shortCents], [2625, 875]);
eq("shares add to the overspend", r.visa.shortCents + r.amex.shortCents, 3500);

r = computeCardShortfalls({ pockets, spend: [], uncategorized: { visa: 4200 }, owedCents: owed });
eq("uncategorized counts as short", [r.visa.shortCents, r.visa.uncategorizedCents], [4200, 4200]);

r = computeCardShortfalls({ pockets, spend: [{ cardId: "visa", categoryId: "fun", spentCents: 8500 }], uncategorized: {}, owedCents: { visa: 0, amex: 0 } });
eq("paid-off card is never short", r.visa.shortCents, 0);

r = computeCardShortfalls({ pockets, spend: [{ cardId: "visa", categoryId: "fun", spentCents: 8500 }, { cardId: "visa", categoryId: "gas", spentCents: 2000 }], uncategorized: { visa: 1000 }, owedCents: { visa: 2000, amex: 0 } });
eq("short trimmed to the balance owed", r.visa.shortCents, 2000);
eq("uncategorized kept first when trimming", r.visa.uncategorizedCents, 1000);

r = computeCardShortfalls({ pockets, spend: [{ cardId: "visa", categoryId: "fun", spentCents: -500 }], uncategorized: {}, owedCents: owed });
eq("refunds don't create shortfall", r.visa.shortCents, 0);

if (failed) { console.error(`${failed} failed`); process.exit(1); } else console.log("all card tests passed");
