/** Credit utilization: how much of the limit is used. Pure so it can be tested. */
export type UtilTone = "good" | "ok" | "warn" | "bad";
export interface Utilization { usedCents: number; limitCents: number; availableCents: number; pct: number; tone: UtilTone; over: boolean }

export function utilization(owedCents: number, limitCents: number): Utilization | null {
  if (!Number.isFinite(limitCents) || limitCents <= 0) return null;
  const used = Math.max(0, owedCents);
  const pct = Math.round((used / limitCents) * 1000) / 10;
  // Under 30% is what credit scoring likes; 30-50 fair; 50-80 high; above that very high.
  const tone: UtilTone = pct < 30 ? "good" : pct < 50 ? "ok" : pct < 80 ? "warn" : "bad";
  return { usedCents: used, limitCents, availableCents: Math.max(0, limitCents - used), pct, tone, over: used > limitCents };
}
