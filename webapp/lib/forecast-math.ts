/**
 * Cash forecast math. Pure and client-safe: dates are ISO "YYYY-MM-DD" strings, money is integer cents (negative = money out).
 * The loader in lib/forecast.ts gathers the known money in and out; this file turns it into a day-by-day balance.
 */
import { nextOccurrence, type Frequency } from "@/lib/recurring-math";
import { LEAD_DAYS, TARGET_UTIL_BPS, ALERT_DAYS } from "@/lib/budget/card-plan";

export type EventKind = "income" | "recurring" | "card" | "loan" | "bill" | "scheduled";

export interface ForecastEvent {
  /** Stable id of the thing it comes from (used so a reminder is only sent once). */
  id: string;
  /** The day it lands in the forecast (never before today: overdue items count as today). */
  date: string;
  /** The real due date (earlier than `date` when overdue). */
  dueDate: string;
  label: string;
  cents: number;
  kind: EventKind;
  href?: string;
  detail?: string;
  /** Push a reminder this many days ahead (0 = only on the day). Left out = no reminder. */
  remindDays?: number;
}

export interface ForecastDay { date: string; netCents: number; balanceCents: number; events: ForecastEvent[] }
export interface Forecast {
  days: ForecastDay[];
  startCents: number;
  endCents: number;
  /** Lowest end-of-day balance in the period. */
  low: { date: string; cents: number };
  /** First day the balance drops below zero, if it does. */
  firstShort: { date: string; cents: number } | null;
  inCents: number;
  outCents: number;
}

const DAY = 86_400_000;
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const addDays = (iso: string, n: number) => new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY);
const pad = (n: number) => String(n).padStart(2, "0");

/** Every date in [from, to] that falls on `day` of a month (a day past the end of a short month lands on its last day). */
export function monthlyDates(day: number, from: string, to: string): string[] {
  const out: string[] = [];
  let y = +from.slice(0, 4), m = +from.slice(5, 7) - 1;
  for (let guard = 0; guard < 40; guard++) {
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const iso = `${y}-${pad(m + 1)}-${pad(Math.min(Math.max(1, day), dim))}`;
    if (iso > to) break;
    if (iso >= from) out.push(iso);
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

/**
 * Occurrences of a repeating item up to `end`. Past-due ones (not posted yet) land on today, at most 24 of them
 * (the same cap as posting). `endIso` is the item's own last date, when it has one.
 */
export function occurrences(nextDate: string, freq: Frequency, anchorDay: number, today: string, end: string, endIso: string | null): { date: string; dueDate: string }[] {
  const out: { date: string; dueDate: string }[] = [];
  let cur = nextDate, late = 0, guard = 0;
  while (cur <= end && (!endIso || cur <= endIso) && guard++ < 400) {
    if (cur < today) { if (++late <= 24) out.push({ date: today, dueDate: cur }); }
    else out.push({ date: cur, dueDate: cur });
    cur = nextOccurrence(cur, freq, anchorDay);
  }
  return out;
}

export interface CardInput {
  id: string; name: string; owedCents: number; limitCents: number | null;
  statementDay: number | null; dueDay: number | null;
  /** Charges (+) and refunds / payments (-) already dated in the future, plus repeating charges. */
  charges: { date: string; cents: number }[];
  today: string; end: string; href?: string;
}

/**
 * Cash leaving to pay a card, following the app's plan: pay down a couple of days before the statement closes (to the
 * target share of the limit), then pay what is left by the due date. Charges that land on the card in between add to it.
 */
export function cardEvents(c: CardInput): ForecastEvent[] {
  const target = c.limitCents && c.limitCents > 0 ? Math.floor((c.limitCents * TARGET_UTIL_BPS) / 10_000) : 0;
  const payBys = new Map<string, string>(); // day -> real pay-by date
  if (c.statementDay) {
    for (const close of monthlyDates(c.statementDay, c.today, addDays(c.end, LEAD_DAYS))) {
      const by = addDays(close, -LEAD_DAYS);
      const day = by < c.today ? c.today : by;
      if (day <= c.end) payBys.set(day, by);
    }
  }
  const dues = new Set(c.dueDay ? monthlyDates(c.dueDay, c.today, c.end) : []);
  const out: ForecastEvent[] = [];
  let owed = Math.max(0, c.owedCents);
  for (let d = c.today; d <= c.end; d = addDays(d, 1)) {
    for (const ch of c.charges) if (ch.date === d || (ch.date < c.today && d === c.today)) owed = Math.max(0, owed + ch.cents);
    const by = payBys.get(d);
    if (by !== undefined) {
      const pay = Math.max(0, owed - target);
      if (pay > 0) {
        out.push({ id: `card-close:${c.id}`, date: d, dueDate: by, label: `Pay down ${c.name}`, cents: -pay, kind: "card", href: c.href, detail: "before the statement closes", remindDays: ALERT_DAYS });
        owed -= pay;
      }
    }
    if (dues.has(d) && owed > 0) {
      out.push({ id: `card-due:${c.id}`, date: d, dueDate: d, label: `Pay ${c.name}`, cents: -owed, kind: "card", href: c.href, detail: "payment due", remindDays: ALERT_DAYS });
      owed = 0;
    }
  }
  return out;
}

export function buildForecast(i: { today: string; horizon: number; startCents: number; events: ForecastEvent[] }): Forecast {
  const end = addDays(i.today, i.horizon);
  const byDate = new Map<string, ForecastEvent[]>();
  for (const e of i.events) {
    const date = e.date < i.today ? i.today : e.date;
    if (date > end) continue;
    byDate.set(date, [...(byDate.get(date) ?? []), { ...e, date }]);
  }
  const days: ForecastDay[] = [];
  let bal = i.startCents, inC = 0, outC = 0;
  let low = { date: i.today, cents: Number.POSITIVE_INFINITY };
  let firstShort: Forecast["firstShort"] = null;
  for (let n = 0; n <= i.horizon; n++) {
    const date = addDays(i.today, n);
    const events = (byDate.get(date) ?? []).sort((a, b) => b.cents - a.cents);
    const net = events.reduce((s, e) => s + e.cents, 0);
    for (const e of events) { if (e.cents > 0) inC += e.cents; else outC += -e.cents; }
    bal += net;
    days.push({ date, netCents: net, balanceCents: bal, events });
    if (bal < low.cents) low = { date, cents: bal };
    if (!firstShort && bal < 0) firstShort = { date, cents: bal };
  }
  return { days, startCents: i.startCents, endCents: bal, low, firstShort, inCents: inC, outCents: outC };
}
