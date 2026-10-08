import { splitProRata, type Key, type Parts } from "./funding-math";

export interface RetagMove { pocketId: string; from: Key; to: string; cents: number }

/**
 * An account whose pockets claim more cash than it holds has a negative pool. This plans label moves that
 * shift pocket money from such an account to accounts with free cash, so every account matches what it really holds.
 * Pocket totals never change; only which account each pocket's money is tagged to.
 * `pools`: free cash per account (negative = pockets claim more than it holds). `holdings`: each pocket's money by account.
 */
export function planRebalance(pools: ReadonlyMap<Key, number>, holdings: ReadonlyMap<string, Parts>): RetagMove[] {
  const held = new Map<string, Map<Key, number>>();
  for (const [pid, parts] of holdings) held.set(pid, new Map(parts.filter(([, n]) => n > 0)));
  const surplus = [...pools].filter(([k, n]) => k !== null && n > 0).map(([k, n]) => [k as string, n] as [string, number]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const deficits = [...pools].filter(([, n]) => n < 0).sort((a, b) => a[1] - b[1]);
  const merged = new Map<string, RetagMove>();
  for (const [dKey, dPool] of deficits) {
    const totalHeld = [...held.values()].reduce((s, m) => s + (m.get(dKey) ?? 0), 0);
    let need = Math.min(-dPool, totalHeld);
    for (const s of surplus) {
      if (need <= 0) break;
      const chunk = Math.min(need, s[1]);
      if (chunk <= 0) continue;
      const holding: Parts = [...held].map(([pid, m]) => [pid, m.get(dKey) ?? 0] as [string, number]).filter(([, n]) => n > 0);
      for (const [pid, n] of splitProRata(holding, chunk)) {
        const m = held.get(pid as string)!;
        m.set(dKey, (m.get(dKey) ?? 0) - n);
        m.set(s[0], (m.get(s[0]) ?? 0) + n);
        const id = `${pid}|${dKey}|${s[0]}`;
        const cur = merged.get(id);
        if (cur) cur.cents += n; else merged.set(id, { pocketId: pid as string, from: dKey, to: s[0], cents: n });
      }
      s[1] -= chunk;
      need -= chunk;
    }
  }
  return [...merged.values()];
}
