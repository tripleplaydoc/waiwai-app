/** Monthly cycle dates (statement closing day, payment due day). Pure, client-safe. */
const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** The next date (today counts) that falls on `day` of the month; a day past the end of a short month lands on its last day. */
export function nextDayOfMonth(day: number, todayIso: string): { iso: string; days: number } {
  const y = +todayIso.slice(0, 4), m0 = +todayIso.slice(5, 7) - 1;
  let yy = y, mm = m0;
  let d = Math.min(day, daysInMonth(yy, mm));
  if (`${yy}-${pad(mm + 1)}-${pad(d)}` < todayIso) {
    mm += 1; if (mm > 11) { mm = 0; yy += 1; }
    d = Math.min(day, daysInMonth(yy, mm));
  }
  const iso = `${yy}-${pad(mm + 1)}-${pad(d)}`;
  return { iso, days: Math.round((utc(iso) - utc(todayIso)) / 86_400_000) };
}

export function shortDate(iso: string): string {
  return new Date(utc(iso)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
export const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);
