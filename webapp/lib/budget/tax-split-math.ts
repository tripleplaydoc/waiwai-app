import { splitProRata, type Parts } from "./funding-math";
import type { Move, Draw } from "./cashflow-waterfall";

/** A per-account tax reserve pocket. */
export interface TaxSplitPocket { id: string; accountId: string }

/**
 * Sends every waterfall move that targets the main tax pocket to the per-account pockets instead,
 * in proportion to the ready cash each account holds. With no cash anywhere (or no split pockets) the move is left alone.
 */
export function expandTaxMoves(moves: Move[], taxId: string, splits: TaxSplitPocket[], pools: ReadonlyMap<string | null, number>): Move[] {
  if (splits.length === 0) return moves;
  const weights: Parts = splits.map((s) => [s.id, Math.max(0, pools.get(s.accountId) ?? 0)]);
  const out: Move[] = [];
  for (const m of moves) {
    if (m.categoryId !== taxId) { out.push(m); continue; }
    const parts = splitProRata(weights, m.cents);
    if (parts.length === 0) { out.push(m); continue; }
    for (const [id, cents] of parts) out.push({ ...m, categoryId: id as string, cents });
  }
  return out;
}

/**
 * Covering a shortfall draws on "Taxes" as one bucket. Spread each draw from the main tax pocket across
 * all tax pockets in proportion to what each holds, never taking more than a pocket has.
 */
export function expandCoverDraws(draws: Draw[], taxId: string, balances: { id: string; balanceCents: number }[]): Draw[] {
  const bal = new Map(balances.map((b) => [b.id, Math.max(0, b.balanceCents)]));
  const out: Draw[] = [];
  for (const d of draws) {
    if (d.fromId !== taxId) { out.push(d); continue; }
    const parts = splitProRata([...bal].map(([id, n]) => [id, n] as [string, number]), d.cents);
    let placed = 0;
    for (const [id, cents] of parts) {
      const take = Math.min(cents, bal.get(id as string) ?? 0);
      if (take <= 0) continue;
      bal.set(id as string, (bal.get(id as string) ?? 0) - take);
      placed += take;
      out.push({ ...d, fromId: id as string, cents: take });
    }
    // rounding or empty pockets: whatever could not be placed stays on the main pocket draw
    if (placed < d.cents) out.push({ ...d, cents: d.cents - placed });
  }
  return out;
}
