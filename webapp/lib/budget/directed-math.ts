/**
 * Choosing which pockets a cash move belongs to. Pure integer-cents math, no database.
 * Only the "Held in" label moves; pocket amounts never change.
 */
export type Want = [string, number];

/**
 * Caps what the person asked to send to each pocket: never more than the pocket holds in the sending
 * account, and never more than `maxTotal` across all pockets (earlier pockets win when the total runs out).
 * Zero and negative requests are dropped.
 */
export function capDirected(wants: readonly Want[], held: ReadonlyMap<string, number>, maxTotal: number): Want[] {
  const out: Want[] = [];
  let left = Math.max(0, maxTotal);
  const seen = new Set<string>();
  for (const [pid, asked] of wants) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    const n = Math.min(Math.max(0, Math.floor(asked)), Math.max(0, held.get(pid) ?? 0), left);
    if (n <= 0) continue;
    out.push([pid, n]);
    left -= n;
  }
  return out;
}

export interface HeldRow { pocketId: string; a: number; b: number; targetB: number }
export interface HeldMove { pocketId: string; from: "a" | "b"; cents: number }

/**
 * Two accounts, A and B. Each pocket holds `a` in A and `b` in B; the person wants it to hold `targetB` in B
 * (and the rest in A). Returns the label moves that get there. The target is kept between 0 and what the pocket
 * holds in the two accounts together, so the pocket's total never changes.
 */
export function planHeldEdit(rows: readonly HeldRow[]): HeldMove[] {
  const out: HeldMove[] = [];
  for (const r of rows) {
    const total = Math.max(0, r.a) + Math.max(0, r.b);
    const want = Math.min(Math.max(0, Math.floor(r.targetB)), total);
    const delta = want - Math.max(0, r.b);
    if (delta > 0) out.push({ pocketId: r.pocketId, from: "a", cents: delta });
    else if (delta < 0) out.push({ pocketId: r.pocketId, from: "b", cents: -delta });
  }
  return out;
}
