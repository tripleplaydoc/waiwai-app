/**
 * Personal flow — pure math, integer cents, no database.
 *
 *   Ready to assign  →  Give / Save / Live / Reservoirs (adjustable percentages that add to 100%)
 *   Inside each bucket:
 *     1. pockets with a target are filled by need (proportionally if the bucket is short)
 *     2. whatever is left is shared by each pocket's flowShareBps
 *        (if none has a share, the bucket's first pocket takes it)
 *   A bucket with no pockets leaves its money in Ready to assign.
 */
import { distribute } from "./allocation";
import { fillByNeed } from "./cashflow-waterfall";

export type PersonalBucket = "GIVE" | "SAVE" | "LIVE" | "RESERVE";
export const BUCKETS: PersonalBucket[] = ["GIVE", "SAVE", "LIVE", "RESERVE"];

export interface PersonalPocket { id: string; needCents: number; shareBps: number }
export interface PersonalAssignInput {
  readyCents: number;
  splits: Record<PersonalBucket, number>; // bps
  buckets: Record<PersonalBucket, PersonalPocket[]>;
}
export interface PersonalMove { categoryId: string; cents: number; bucket: PersonalBucket }
export interface PersonalPlan {
  moves: PersonalMove[]; // each > 0, one per pocket per bucket (need + extra merged)
  totals: Record<PersonalBucket, number>;
  leftoverCents: number;
}

/** Splits `total` by weights, always handing out the whole total (largest remainder). */
export function splitAll(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  let rem = total - out.reduce((s, n) => s + n, 0);
  const order = exact.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of order) { if (rem <= 0) break; out[i]++; rem--; }
  return out;
}

export function planPersonalAssign(input: PersonalAssignInput): PersonalPlan {
  const ready = Math.max(0, Math.floor(input.readyCents));
  const shares = distribute(ready, BUCKETS.map((b) => Math.max(0, input.splits[b])));
  const totals: Record<PersonalBucket, number> = { GIVE: 0, SAVE: 0, LIVE: 0, RESERVE: 0 };
  const moves: PersonalMove[] = [];

  BUCKETS.forEach((bucket, bi) => {
    const pockets = input.buckets[bucket];
    const money = shares[bi];
    if (money <= 0 || pockets.length === 0) return;
    const got = new Map<string, number>();
    const add = (id: string, c: number) => { if (c > 0) got.set(id, (got.get(id) ?? 0) + c); };

    const needFill = fillByNeed(money, pockets.map((p) => ({ id: p.id, needCents: p.needCents })));
    let used = 0;
    for (const f of needFill) { add(f.id, f.cents); used += f.cents; }

    const extra = money - used;
    if (extra > 0) {
      const weighted = pockets.filter((p) => p.shareBps > 0);
      if (weighted.length === 0) add(pockets[0].id, extra);
      else splitAll(extra, weighted.map((p) => p.shareBps)).forEach((c, i) => add(weighted[i].id, c));
    }
    for (const p of pockets) { const c = got.get(p.id); if (c) { moves.push({ categoryId: p.id, cents: c, bucket }); totals[bucket] += c; } }
  });

  const assigned = totals.GIVE + totals.SAVE + totals.LIVE + totals.RESERVE;
  return { moves, totals, leftoverCents: ready - assigned };
}
