/** Planning math for the tax levers page. Money is integer cents. Guidance only, not tax advice. */

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysBetween = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);

export interface Due { label: string; period: string; date: string; daysAway: number }

/** US federal estimated tax installments for a calendar-year taxpayer: Apr 15, Jun 15, Sep 15, and Jan 15 of the next year. */
export function estimatedDueDates(today: string): Due[] {
  const y = Number(today.slice(0, 4));
  const all: Omit<Due, "daysAway">[] = [
    { label: "Q4 of last year", period: `Sep to Dec ${y - 1}`, date: iso(y, 1, 15) },
    { label: "Q1", period: `Jan to Mar ${y}`, date: iso(y, 4, 15) },
    { label: "Q2", period: `Apr to May ${y}`, date: iso(y, 6, 15) },
    { label: "Q3", period: `Jun to Aug ${y}`, date: iso(y, 9, 15) },
    { label: "Q4", period: `Sep to Dec ${y}`, date: iso(y + 1, 1, 15) },
  ];
  return all.map((d) => ({ ...d, daysAway: daysBetween(today, d.date) }));
}
export const nextDue = (today: string) => estimatedDueDates(today).find((d) => d.daysAway >= 0) ?? null;

/** Year-to-date profit stretched to a full year. */
export function projectYear(ytdCents: number, today: string): number {
  const y = Number(today.slice(0, 4));
  const day = daysBetween(iso(y, 1, 1), today) + 1;
  const total = daysBetween(iso(y, 1, 1), iso(y + 1, 1, 1));
  return day <= 0 ? ytdCents : Math.round((ytdCents * total) / day);
}

/** Tax a deduction saves at the reserve rate. */
export const leverSavings = (deductionCents: number, taxBps: number) => Math.round((Math.max(0, deductionCents) * Math.max(0, taxBps)) / 10000);

/** Simplified home-office method: $5 per square foot, up to 300 square feet. */
export const homeOfficeSimplifiedCents = (sqft: number) => Math.min(Math.max(0, Math.floor(sqft)), 300) * 500;

export const mileageDeductionCents = (miles: number, centsPerMile: number) => Math.round(Math.max(0, miles) * Math.max(0, centsPerMile));

/** A rule of thumb for when an S-corp election is worth discussing with a CPA. */
export const SCORP_DISCUSS_FROM_CENTS = 8_000_000;
