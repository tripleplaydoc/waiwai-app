/** "Today" and "this month" in the user's time zone, not the server's (UTC). */
const TZ = process.env.APP_TIMEZONE || "Pacific/Honolulu";

export function todayIso(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

export function currentMonthIso(now: Date = new Date()): string {
  return todayIso(now).slice(0, 7); // YYYY-MM
}

/** "2026-10" -> Date at midnight UTC on the 1st. Falls back to current month. */
export function monthFromParam(param: string | undefined): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(param ?? "");
  const iso = m && +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}-${m[2]}` : currentMonthIso();
  return new Date(`${iso}-01T00:00:00.000Z`);
}

export function monthParam(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function shiftMonth(d: Date, delta: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "2026-10-03" -> Date at midnight UTC (what @db.Date columns expect). */
export function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
