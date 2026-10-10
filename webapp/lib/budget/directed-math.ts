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

/** What the person typed for "take it from": account id (or "none" for money not tagged to an account) and cents. */
export type TakeFrom = [string, number];

/**
 * Checks a chosen split of a pocket move: the amounts must add up to what is being moved, and no account may give
 * more than the pocket holds in it. Zero and negative entries are ignored and repeats are added together.
 * Returns the parts (account id or null for "none", cents) the money is taken from, or a plain-language problem.
 */
export function resolveTakeFrom(
  takeFrom: readonly TakeFrom[],
  cents: number,
  held: ReadonlyMap<string, number>,
  names: ReadonlyMap<string, string>,
  pocketName: string,
): { ok: true; parts: [string | null, number][] } | { ok: false; error: string } {
  const sums = new Map<string, number>();
  for (const [k, n] of takeFrom) { const c = Math.floor(n); if (c > 0) sums.set(k, (sums.get(k) ?? 0) + c); }
  const total = [...sums.values()].reduce((s, n) => s + n, 0);
  const money = (n: number) => `$${(n / 100).toFixed(2)}`;
  if (total !== cents) return { ok: false, error: `The amounts you chose add up to ${money(total)}, but you are moving ${money(cents)}.` };
  for (const [k, n] of sums) {
    const have = held.get(k) ?? 0;
    if (n > have) return { ok: false, error: `${pocketName} only holds ${money(have)} in ${k === "none" ? "no account" : names.get(k) ?? "that account"}, so it can't give ${money(n)}.` };
  }
  return { ok: true, parts: [...sums].map(([k, n]): [string | null, number] => [k === "none" ? null : k, n]) };
}
