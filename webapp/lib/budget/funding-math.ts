/**
 * Which bank account each assigned dollar came from. Pure integer-cents math, no database.
 * A key is an account id, or null for money assigned before accounts were tracked.
 */
export type Key = string | null;
export type Parts = [Key, number][];

/** Splits `cents` across the positive weights in proportion, summing to exactly `cents` (largest remainder; ties go to the first). */
export function splitProRata(weights: Parts, cents: number): Parts {
  const w = weights.filter(([, n]) => n > 0);
  const total = w.reduce((s, [, n]) => s + n, 0);
  if (cents <= 0 || total <= 0) return [];
  const base = w.map(([k, n]) => {
    const exact = (n * cents) / total;
    const floor = Math.floor(exact);
    return { k, floor, frac: exact - floor };
  });
  let left = cents - base.reduce((s, b) => s + b.floor, 0);
  const order = base.map((_, i) => i).sort((a, b) => base[b].frac - base[a].frac || a - b);
  for (const i of order) { if (left <= 0) break; base[i].floor += 1; left -= 1; }
  return base.filter((b) => b.floor > 0).map((b) => [b.k, b.floor]);
}

/**
 * Draws `cents` from the accounts' ready-to-assign pools: the preferred account first, then the biggest pool, and so on.
 * Only positive pools can be drawn from. `shortCents` is what the pools could not cover.
 */
export function drawFromPools(pools: Parts, cents: number, prefer?: Key): { parts: Parts; shortCents: number } {
  const avail = pools.filter(([k, n]) => k !== null && n > 0) as [string, number][];
  avail.sort((a, b) => (a[0] === prefer ? -1 : b[0] === prefer ? 1 : b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
  const parts: Parts = [];
  let left = Math.max(0, cents);
  for (const [k, n] of avail) {
    if (left <= 0) break;
    const take = Math.min(n, left);
    parts.push([k, take]);
    left -= take;
  }
  return { parts, shortCents: left };
}

/** How a pocket's available money divides between accounts: spending comes out of every tag in proportion. */
export function pocketShares(taggedAssigned: Parts, availableCents: number): Parts {
  if (availableCents <= 0) return [];
  const shares = splitProRata(taggedAssigned, availableCents);
  return shares.length > 0 ? shares : [[null, availableCents]];
}

/** Merges repeated keys and drops zeros. */
export function mergeParts(parts: Parts): Parts {
  const m = new Map<Key, number>();
  for (const [k, n] of parts) m.set(k, (m.get(k) ?? 0) + n);
  return [...m].filter(([, n]) => n !== 0);
}

/**
 * What a pocket holds in each account: the money assigned to it (by tag) plus its spending and refunds.
 * A purchase paid from a bank account comes out of that account's tag first; whatever the tag can't cover
 * (and anything paid by credit card, whose cash is still in the bank) comes out of all tags in proportion.
 * `activity` is signed per paying account (negative = spent). Result: positive parts only.
 */
export function pocketBalances(tagged: Parts, activity: Parts, cashAccounts: ReadonlySet<string>): Parts {
  const bal = new Map<Key, number>();
  for (const [k, n] of tagged) if (n > 0) bal.set(k, (bal.get(k) ?? 0) + n);
  let deferred = 0; // spending to take out of every tag in proportion (negative = refunds to spread)
  for (const [acct, a] of activity) {
    if (acct !== null && cashAccounts.has(acct)) {
      if (a >= 0) bal.set(acct, (bal.get(acct) ?? 0) + a);
      else {
        const take = Math.min(bal.get(acct) ?? 0, -a);
        if (take > 0) bal.set(acct, (bal.get(acct) ?? 0) - take);
        deferred += -a - take;
      }
    } else deferred += -a;
  }
  let parts: Parts = [...bal].filter(([, n]) => n > 0);
  if (deferred > 0) {
    const total = parts.reduce((s, [, n]) => s + n, 0);
    const cut = splitProRata(parts, Math.min(deferred, total));
    const m = new Map(parts);
    for (const [k, n] of cut) m.set(k, (m.get(k) ?? 0) - n);
    parts = [...m].filter(([, n]) => n > 0);
  } else if (deferred < 0) {
    const add = splitProRata(parts, -deferred);
    const m = new Map<Key, number>(parts);
    if (add.length === 0) m.set(null, (m.get(null) ?? 0) - deferred);
    for (const [k, n] of add) m.set(k, (m.get(k) ?? 0) + n);
    parts = [...m].filter(([, n]) => n > 0);
  }
  return parts;
}
