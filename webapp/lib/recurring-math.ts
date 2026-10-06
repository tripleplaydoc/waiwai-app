/** Schedules for repeating charges. Dates are ISO yyyy-mm-dd; everything is plain calendar math (no time zones). */
export type Frequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "WEEKLY", label: "Every week" }, { value: "BIWEEKLY", label: "Every 2 weeks" }, { value: "MONTHLY", label: "Every month" },
  { value: "QUARTERLY", label: "Every 3 months" }, { value: "YEARLY", label: "Every year" },
];

const dim = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
const iso = (y: number, m0: number, d: number) => `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** The date after `fromIso` in the schedule. Monthly-style schedules keep `anchorDay` (the 31st lands on the last day of short months). */
export function nextOccurrence(fromIso: string, freq: Frequency, anchorDay: number): string {
  const y = +fromIso.slice(0, 4), m0 = +fromIso.slice(5, 7) - 1, d = +fromIso.slice(8, 10);
  if (freq === "WEEKLY" || freq === "BIWEEKLY") {
    const n = new Date(Date.UTC(y, m0, d + (freq === "WEEKLY" ? 7 : 14)));
    return n.toISOString().slice(0, 10);
  }
  const step = freq === "MONTHLY" ? 1 : freq === "QUARTERLY" ? 3 : 12;
  const total = y * 12 + m0 + step;
  const ny = Math.floor(total / 12), nm = total % 12;
  return iso(ny, nm, Math.min(anchorDay, dim(ny, nm)));
}

/** Every occurrence from `nextDate` up to and including `today` (and not past `endIso`), at most `max` of them. */
export function dueDates(nextDate: string, freq: Frequency, anchorDay: number, today: string, endIso: string | null, max = 24): string[] {
  const out: string[] = [];
  let cur = nextDate;
  while (cur <= today && (!endIso || cur <= endIso) && out.length < max) { out.push(cur); cur = nextOccurrence(cur, freq, anchorDay); }
  return out;
}

/** The monthly cost of a schedule, in cents (positive), for totals. */
export function monthlyEquivalent(amountCents: number, freq: Frequency): number {
  const a = Math.abs(amountCents);
  switch (freq) {
    case "WEEKLY": return Math.round((a * 52) / 12);
    case "BIWEEKLY": return Math.round((a * 26) / 12);
    case "MONTHLY": return a;
    case "QUARTERLY": return Math.round(a / 3);
    case "YEARLY": return Math.round(a / 12);
  }
}

export const isFrequency = (v: string): v is Frequency => FREQUENCIES.some((f) => f.value === v);
