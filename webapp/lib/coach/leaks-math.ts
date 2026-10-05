import { matchRule } from "@/lib/budget/suggest";

/** One outflow (positive cents). */
export interface Spend { payee: string; date: string; cents: number }

export type Cadence = "monthly" | "quarterly" | "yearly";
export interface Recurring {
  key: string; payee: string; cadence: Cadence; count: number;
  /** Typical charge. */
  typicalCents: number; lastCents: number; lastDate: string;
  /** Cost per month (yearly / 12, quarterly / 3). */
  monthlyCents: number;
  typeKey: string | null;
  subscriptionLike: boolean;
  /** Charge went up: latest versus the typical charge before it. */
  creep: { fromCents: number; toCents: number; perYearCents: number; pct: number } | null;
  /** Still charging (last charge within 1.6 cycles of today). */
  active: boolean;
}
export interface DoubleCharge { payee: string; cents: number; dates: [string, string] }
export interface Overlap { typeKey: string; label: string; payees: string[]; monthlyCents: number }
export interface LeakReport { recurring: Recurring[]; creeping: Recurring[]; doubles: DoubleCharge[]; overlaps: Overlap[]; subscriptionMonthlyCents: number; recurringMonthlyCents: number }

const SUB_TYPES = new Set(["SOFTWARE", "ENTERTAINMENT", "EDUCATION"]);
const days = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
/** Bank wording like "ZOOM.US 888-799 CA" and "Zoom" both land on "zoom us". */
export const payeeKey = (p: string) => p.toLowerCase().replace(/[0-9#*]+/g, " ").replace(/[^a-z& ]+/g, " ").replace(/\b(inc|llc|co|corp|com|www|payment|purchase|pos|debit|card|recurring|autopay)\b/g, " ").replace(/\s+/g, " ").trim();

function cadenceOf(gaps: number[]): Cadence | null {
  const g = median(gaps);
  if (g >= 25 && g <= 35) return "monthly";
  if (g >= 80 && g <= 100) return "quarterly";
  if (g >= 340 && g <= 390) return "yearly";
  return null;
}

/** Finds charges that repeat on a schedule, price increases, double charges and overlapping subscriptions. */
export function analyzeLeaks(spends: Spend[], today: string): LeakReport {
  const groups = new Map<string, Spend[]>();
  for (const s of spends) {
    const k = payeeKey(s.payee);
    if (k.length < 2 || s.cents <= 0) continue;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const recurring: Recurring[] = [];
  const doubles: DoubleCharge[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    // Same amount twice within 3 days = possible double charge (not for tiny amounts).
    for (let i = 1; i < list.length; i++) {
      if (list[i].cents === list[i - 1].cents && list[i].cents >= 500 && days(list[i - 1].date, list[i].date) <= 3 && days(list[i - 1].date, list[i].date) >= 0 && days(list[i - 1].date, today) <= 120) doubles.push({ payee: list[i].payee, cents: list[i].cents, dates: [list[i - 1].date, list[i].date] });
    }
    // Collapse same-day repeats before judging the schedule.
    const dated = list.filter((s, i) => i === 0 || s.date !== list[i - 1].date);
    if (dated.length < 3 && !(dated.length === 2 && days(dated[0].date, dated[1].date) >= 340)) continue;
    const gaps = dated.slice(1).map((s, i) => days(dated[i].date, s.date));
    const cadence = cadenceOf(gaps);
    if (!cadence) continue;
    const amounts = dated.map((s) => s.cents);
    const typical = median(amounts);
    // Variable bills are fine (utilities); wild swings are not a subscription pattern.
    if (amounts.filter((a) => Math.abs(a - typical) / typical <= 0.6).length < amounts.length * 0.7) continue;
    const last = dated[dated.length - 1];
    const cycle = cadence === "monthly" ? 31 : cadence === "quarterly" ? 92 : 366;
    const active = days(last.date, today) <= cycle * 1.6;
    const before = amounts.slice(0, -1);
    const base = before.length >= 2 ? median(before.slice(-Math.min(before.length, cadence === "monthly" ? 6 : 3))) : before[0];
    const cycles = cadence === "monthly" ? 12 : cadence === "quarterly" ? 4 : 1;
    const creep = active && base > 0 && last.cents >= base * 1.05 && last.cents - base >= 100
      ? { fromCents: base, toCents: last.cents, perYearCents: (last.cents - base) * cycles, pct: Math.round(((last.cents - base) / base) * 100) } : null;
    const lastPayee = dated[dated.length - 1].payee;
    const rule = matchRule(lastPayee) ?? matchRule(lastPayee.replace(/[._*#/\-]+/g, " "));
    recurring.push({
      key, payee: dated[dated.length - 1].payee, cadence, count: dated.length, typicalCents: typical, lastCents: last.cents, lastDate: last.date,
      monthlyCents: Math.round(last.cents / (cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12)),
      typeKey: rule?.type ?? null, subscriptionLike: !!rule && SUB_TYPES.has(rule.type), creep, active,
    });
  }
  recurring.sort((a, b) => b.monthlyCents - a.monthlyCents);
  const act = recurring.filter((r) => r.active);

  const byType = new Map<string, Recurring[]>();
  for (const r of act) if (r.subscriptionLike && r.typeKey) byType.set(r.typeKey, [...(byType.get(r.typeKey) ?? []), r]);
  const labels: Record<string, string> = { SOFTWARE: "software and subscriptions", ENTERTAINMENT: "entertainment and streaming", EDUCATION: "courses and memberships" };
  const overlaps: Overlap[] = [...byType.entries()].filter(([, rs]) => rs.length >= 3)
    .map(([typeKey, rs]) => ({ typeKey, label: labels[typeKey] ?? typeKey, payees: rs.map((r) => r.payee), monthlyCents: rs.reduce((t, r) => t + r.monthlyCents, 0) }));

  return {
    recurring: act, creeping: act.filter((r) => r.creep).sort((a, b) => b.creep!.perYearCents - a.creep!.perYearCents),
    doubles: doubles.sort((a, b) => b.dates[1].localeCompare(a.dates[1])).slice(0, 8), overlaps,
    subscriptionMonthlyCents: act.filter((r) => r.subscriptionLike).reduce((t, r) => t + r.monthlyCents, 0),
    recurringMonthlyCents: act.reduce((t, r) => t + r.monthlyCents, 0),
  };
}

/** A short, honest script for lowering a bill, by the kind of bill. */
export function negotiationScript(typeKey: string | null, payee: string, pct: number): string {
  const up = `My ${payee} bill went up ${pct}%.`;
  if (typeKey === "INSURANCE") return `${up} Ask for a re-quote at renewal, a multi-policy or bundle discount, and a higher deductible. Then compare two other insurers: a competing quote is your leverage.`;
  if (typeKey === "UTILITIES") return `${up} Ask what promotional or loyalty rate you qualify for, whether you are on the right plan for your usage, and whether a competitor's offer can be matched.`;
  if (typeKey === "SOFTWARE" || typeKey === "EDUCATION" || typeKey === "ENTERTAINMENT") return `${up} Check for an annual plan (often 15 to 20% lower), a downgrade tier, or cancel and let them offer a retention discount. If you do not use it weekly, pause it.`;
  return `${up} Call and ask for the loyalty or retention rate, ask if the price was raised after a promotion ended, and be ready to cancel. Even one call can reverse an increase.`;
}
