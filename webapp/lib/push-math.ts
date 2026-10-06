/** Which forecast events deserve a push today, and how they read. Pure. */
import { daysBetween, type ForecastEvent } from "@/lib/forecast-math";

export interface Reminder { key: string; text: string; url: string }

const money = (c: number) => `$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${MON[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;

/**
 * Events inside their reminder window. Each goes out at most twice: once when it first comes inside the window ("early") and
 * once on the day ("day"). `prefix` tags the workspace (e.g. "Business: ").
 */
export function remindersFor(events: ForecastEvent[], today: string, ws: string, prefix = ""): Reminder[] {
  const out: Reminder[] = [];
  for (const e of events) {
    if (e.remindDays === undefined) continue;
    const n = daysBetween(today, e.dueDate < today ? today : e.dueDate);
    if (n > e.remindDays) continue;
    const stage = n <= 0 ? "day" : "early";
    const late = e.dueDate < today;
    const lead = n <= 0 ? (late ? "was due " + short(e.dueDate) : "today") : n === 1 ? "tomorrow" : `${short(e.dueDate)}`;
    const verb = e.kind === "recurring" || e.kind === "income" ? `${e.label} is waiting to be posted` : `${e.label}: ${money(e.cents)}`;
    out.push({
      key: `${ws}:${e.id}:${e.dueDate}:${stage}`,
      text: `${prefix}${verb}${e.kind === "recurring" || e.kind === "income" ? "" : ` ${late ? "(overdue)" : lead === "today" ? "due today" : "due " + lead}`}`,
      url: e.href ?? "/budget",
    });
  }
  return out;
}

export function shortReminder(ws: string, prefix: string, firstShort: { date: string; cents: number } | null, today: string, withinDays = 14): Reminder | null {
  if (!firstShort || daysBetween(today, firstShort.date) > withinDays) return null;
  return { key: `${ws}:short:${firstShort.date}`, text: `${prefix}Cash is projected to run short on ${short(firstShort.date)} by ${money(firstShort.cents)}.`, url: "/forecast" };
}
