/**
 * Credit card "set aside" math (pure, integer cents).
 *
 * A card purchase comes out of its pocket the moment you record it, so the money is "set aside" automatically.
 * A card is only SHORT where that didn't hold up:
 *   - a pocket went below zero and part of that overspending was put on the card, or
 *   - card spending has no pocket yet.
 * Shortfall can never exceed what is actually owed (a paid-off card isn't short).
 */
export interface Pocket { id: string; name: string; availableCents: number }
/** Net spent on one card in one pocket (positive = money spent; refunds already netted off). */
export interface CardSpend { cardId: string; categoryId: string; spentCents: number }
export interface ShortPart { categoryId: string; name: string; cents: number }
export interface CardShort { cardId: string; shortCents: number; parts: ShortPart[]; uncategorizedCents: number }

/** Splits `total` across weights, whole cents, largest remainder, sums exactly to total. */
export function splitByWeight(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((s, v) => s + v, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const o of order) { if (left <= 0) break; out[o.i]++; left--; }
  return out;
}

export function computeCardShortfalls(o: {
  pockets: Pocket[];
  spend: CardSpend[];
  /** Card spending with no pocket, per card (positive = spent). */
  uncategorized: Record<string, number>;
  owedCents: Record<string, number>;
}): Record<string, CardShort> {
  const out: Record<string, CardShort> = {};
  const cardIds = Object.keys(o.owedCents);
  for (const id of cardIds) out[id] = { cardId: id, shortCents: 0, parts: [], uncategorizedCents: Math.max(0, o.uncategorized[id] ?? 0) };

  for (const p of o.pockets) {
    if (p.availableCents >= 0) continue;
    const over = -p.availableCents;
    const onCards = o.spend.filter((s) => s.categoryId === p.id && s.spentCents > 0 && out[s.cardId]);
    const totalOnCards = onCards.reduce((s, x) => s + x.spentCents, 0);
    if (totalOnCards === 0) continue;
    // Only the part of the overspending that was actually charged to cards is a card problem.
    const attributable = Math.min(over, totalOnCards);
    const shares = splitByWeight(attributable, onCards.map((x) => x.spentCents));
    onCards.forEach((x, i) => { if (shares[i] > 0) out[x.cardId].parts.push({ categoryId: p.id, name: p.name, cents: shares[i] }); });
  }

  for (const id of cardIds) {
    const c = out[id];
    let budget = Math.max(0, o.owedCents[id]); // never short by more than is owed
    c.uncategorizedCents = Math.min(c.uncategorizedCents, budget);
    budget -= c.uncategorizedCents;
    c.parts = c.parts.map((p) => { const cents = Math.min(p.cents, budget); budget -= cents; return { ...p, cents }; }).filter((p) => p.cents > 0);
    c.shortCents = c.uncategorizedCents + c.parts.reduce((s, p) => s + p.cents, 0);
  }
  return out;
}
