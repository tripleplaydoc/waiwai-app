/** Which statement rows are probably transactions you already typed in: same amount, within a few days, each existing one used once. */
export interface Row { date: string; amountCents: number }
export interface Existing { id: string; date: string; amountCents: number }
const day = (iso: string) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000);

export function matchExisting(rows: Row[], existing: Existing[], windowDays = 3): boolean[] {
  const used = new Set<string>();
  return rows.map((r) => {
    let best: Existing | null = null, bestGap = Infinity;
    for (const e of existing) {
      if (used.has(e.id) || e.amountCents !== r.amountCents) continue;
      const gap = Math.abs(day(e.date) - day(r.date));
      if (gap <= windowDays && gap < bestGap) { best = e; bestGap = gap; }
    }
    if (best) used.add(best.id);
    return !!best;
  });
}
