/**
 * Cash-on-hand trend for the last `days` days, worked backwards from today's balance.
 * `moves` are signed cents that changed the cash balance on a given day (YYYY-MM-DD).
 * Returns days+1 end-of-day balances, oldest first, the last being `endCents`.
 */
export function cashTrend(endCents: number, moves: { date: string; cents: number }[], today: string, days = 30): number[] {
  const byDay = new Map<string, number>();
  for (const m of moves) byDay.set(m.date, (byDay.get(m.date) ?? 0) + m.cents);
  const out: number[] = new Array(days + 1);
  let bal = endCents;
  const t = Date.parse(`${today}T00:00:00Z`);
  for (let i = days; i >= 0; i--) {
    out[i] = bal;
    const iso = new Date(t - (days - i) * 86400000).toISOString().slice(0, 10);
    bal -= byDay.get(iso) ?? 0;
  }
  return out;
}
