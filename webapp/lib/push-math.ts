/** Which forecast events deserve a push today, and how they read. Pure. */
import { daysBetween, type ForecastEvent } from "@/lib/forecast-math";

export interface Reminder { key: string; text: string; url: string }

const money = (c: number) => `$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${MON[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;

/**
 * Tone: benefit first, calm, never alarm words (overdue, warning, short, urgent). Each event goes out at most twice: once when it
 * first comes inside the window ("early") and once on the day ("day"). `prefix` tags the workspace (e.g. "Business: ").
 */
export function remindersFor(events: ForecastEvent[], today: string, ws: string, prefix = ""): Reminder[] {
  const out: Reminder[] = [];
  for (const e of events) {
    if (e.remindDays === undefined) continue;
    const n = daysBetween(today, e.dueDate < today ? today : e.dueDate);
    if (n > e.remindDays) continue;
    const stage = n <= 0 ? "day" : "early";
    const late = e.dueDate < today;
    const when = n <= 0 ? "today" : n === 1 ? "tomorrow" : `on ${short(e.dueDate)}`;
    let text: string;
    if (e.kind === "recurring" || e.kind === "income") text = `${e.label} is ready to post`;
    else if (e.id.startsWith("card-close:")) text = `${e.label.replace(/^Pay down /, "")}: a ${money(e.cents)} payment ${when} keeps your credit use low`;
    else if (e.id.startsWith("card-due:")) text = `${e.label.replace(/^Pay /, "")} payment of ${money(e.cents)} is due ${when}`;
    else text = late ? `${e.label} (${money(e.cents)}) is waiting for you` : `${e.label} (${money(e.cents)}) is coming up ${when}`;
    out.push({ key: `${ws}:${e.id}:${e.dueDate}:${stage}`, text: `${prefix}${text}`, url: e.href ?? "/budget" });
  }
  return out;
}

/** A gentle heads-up about a dip, only when it is close enough to matter. */
export function shortReminder(ws: string, prefix: string, firstShort: { date: string; cents: number } | null, today: string, withinDays = 14): Reminder | null {
  if (!firstShort || daysBetween(today, firstShort.date) > withinDays) return null;
  const days = daysBetween(today, firstShort.date);
  return { key: `${ws}:short:${firstShort.date}`, text: `${prefix}There's a ${money(firstShort.cents)} gap to plan for around ${short(firstShort.date)}. You have ${days} day${days === 1 ? "" : "s"} to arrange it.`, url: "/forecast" };
}

/** One true good thing to open the morning message with, or null. */
export function winLine(inCents: number, hasGap: boolean): string | null {
  if (inCents > 0) return `${money(inCents)} is on its way in over the next 30 days.`;
  if (!hasGap) return "Your next 30 days look covered.";
  return null;
}

export const greetingTitle = (name: string) => (name.trim() ? `Good morning, ${name.trim()}` : "Good morning");
