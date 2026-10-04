/**
 * Percentage allocation. Categories (groups) get a share of the pool and
 * pockets get a share of their category. Percentages are basis points
 * (10000 = 100%). Remainders are handed out by largest-remainder so the cents
 * always add up exactly and never exceed what is being distributed.
 */
export interface AllocPocket { id: string; bps: number | null }
export interface AllocGroup { id: string; bps: number | null; pockets: AllocPocket[] }

/** Splits `total` cents by `weights` (bps). Result sums to round(total * sum(weights) / 10000). */
export function distribute(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || sumW <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / 10000);
  const floors = exact.map(Math.floor);
  let remainder = Math.round((total * sumW) / 10000) - floors.reduce((s, n) => s + n, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}

export function bpsProblem(groups: AllocGroup[]): string | null {
  const g = groups.reduce((s, x) => s + (x.bps ?? 0), 0);
  if (g > 10000) return "Category percentages add up to more than 100%.";
  for (const grp of groups) {
    const p = grp.pockets.reduce((s, x) => s + (x.bps ?? 0), 0);
    if (p > 10000) return "Pocket percentages inside a category add up to more than 100%.";
  }
  return null;
}

export interface AllocationPlan {
  pockets: { id: string; cents: number }[]; // only entries > 0
  groupShares: { id: string; cents: number }[];
  allocatedCents: number;
  unallocatedCents: number;
}

export function planAllocation(poolCents: number, groups: AllocGroup[]): AllocationPlan {
  const pool = Math.max(0, Math.floor(poolCents));
  const withPct = groups.filter((g) => (g.bps ?? 0) > 0);
  const shares = distribute(pool, withPct.map((g) => g.bps as number));
  const pockets: { id: string; cents: number }[] = [];
  const groupShares: { id: string; cents: number }[] = [];
  withPct.forEach((g, gi) => {
    groupShares.push({ id: g.id, cents: shares[gi] });
    const live = g.pockets.filter((p) => (p.bps ?? 0) > 0);
    const parts = distribute(shares[gi], live.map((p) => p.bps as number));
    live.forEach((p, pi) => { if (parts[pi] > 0) pockets.push({ id: p.id, cents: parts[pi] }); });
  });
  const allocated = pockets.reduce((s, p) => s + p.cents, 0);
  return { pockets, groupShares, allocatedCents: allocated, unallocatedCents: pool - allocated };
}
