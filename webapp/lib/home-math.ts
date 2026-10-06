/**
 * Wording and selection for the Home screen and reminders. Pure and client-safe. The tone rule: lead with what is good, offer
 * next steps as choices (benefit first, how much time there is, a way to do it), and never use alarm words
 * (overdue, warning, alert, short, urgent).
 */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDay = (iso: string) => `${MON[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;
export const money = (c: number) => `$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "tomorrow", "today", "on Oct 14". */
export function whenWords(days: number, iso: string): string {
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `on ${shortDay(iso)}`;
}

export function greeting(hour: number, name: string): string {
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return name.trim() ? `${part}, ${name.trim()}.` : `${part}.`;
}

export interface Win { key: string; text: string }
export interface WinInput {
  weekChangeCents: number | null;
  comingInCents: number;
  readyToAssignCents: number;
  cardUse: { name: string; pct: number }[];
  billsPaid: number; billsTotal: number;
  noOverspent: boolean;
  allSorted: boolean;
  activeDays: number;
}

/** Only things that are true in the data. At most four; if there are none, one plain true line. */
export function buildWins(i: WinInput): Win[] {
  const out: Win[] = [];
  if (i.weekChangeCents !== null && i.weekChangeCents > 0) out.push({ key: "week", text: `${money(i.weekChangeCents)} more across your accounts than a week ago` });
  if (i.comingInCents > 0) out.push({ key: "in", text: `${money(i.comingInCents)} is on its way in over the next 7 days` });
  if (i.readyToAssignCents > 0) out.push({ key: "rta", text: `${money(i.readyToAssignCents)} is ready to give a purpose` });
  for (const c of i.cardUse.filter((c) => c.pct < 30).slice(0, 2)) out.push({ key: `card-${c.name}`, text: `${c.name} is at ${c.pct}% of its limit, under the healthy 30% line` });
  if (i.billsTotal > 0 && i.billsPaid > 0) out.push({ key: "bills", text: i.billsPaid === i.billsTotal ? `All ${i.billsTotal} bills are handled this month` : `${i.billsPaid} of ${i.billsTotal} bills handled this month` });
  if (i.noOverspent) out.push({ key: "envelopes", text: "Every envelope is within its budget" });
  if (i.allSorted) out.push({ key: "sorted", text: "Everything you've entered is sorted into a category" });
  if (i.activeDays >= 3) out.push({ key: "streak", text: `You've recorded activity on ${i.activeDays} of the last 7 days` });
  const top = out.slice(0, 4);
  return top.length > 0 ? top : [{ key: "one-place", text: "Your money is all in one place now" }];
}

export interface Step { key: string; title: string; detail: string; action: string; href: string; days: number }

export function cardCloseStep(c: { id: string; name: string; payDownCents: number; payByDays: number; payByIso: string; reportedPct: number | null; href: string }): Step {
  return {
    key: `close-${c.id}`, days: c.payByDays, action: "Pay", href: c.href,
    title: `${c.name}: a ${money(c.payDownCents)} payment ${whenWords(c.payByDays, c.payByIso)}`,
    detail: c.reportedPct !== null ? `Your reported credit use drops to about ${c.reportedPct}%, which your credit score likes.` : "It keeps the balance low when the statement closes.",
  };
}
export function cardDueStep(c: { id: string; name: string; owedCents: number; dueDays: number; dueIso: string; href: string }): Step {
  return {
    key: `due-${c.id}`, days: c.dueDays, action: "Pay", href: c.href,
    title: `${c.name}: ${money(c.owedCents)} due ${whenWords(c.dueDays, c.dueIso)}`,
    detail: "Paying in full keeps interest at zero.",
  };
}
export function recurringStep(r: { payee: string; amountCents: number; href: string }): Step {
  return { key: `rec-${r.payee}`, days: 0, action: "Post", href: r.href, title: `${r.payee} is ready to post`, detail: `${money(r.amountCents)}, one tap to record it.` };
}
export function sortStep(n: number, href: string): Step {
  return { key: "sort", days: 1, action: "Sort", href, title: `${n} quick sort${n === 1 ? "" : "s"}`, detail: "Giving each one a category keeps your budget accurate." };
}
export function billStep(b: { id: string; label: string; cents: number; days: number; iso: string; late: boolean; href: string }): Step {
  return {
    key: `bill-${b.id}-${b.iso}`, days: b.late ? 0 : b.days, action: "Open", href: b.href,
    title: b.late ? `${b.label}: ${money(b.cents)} is waiting for you` : `${b.label}: ${money(b.cents)} comes up ${whenWords(b.days, b.iso)}`,
    detail: "Record it when it's paid and the budget updates itself.",
  };
}
export function gapStep(g: { cents: number; iso: string; days: number }): Step {
  return {
    key: `gap-${g.iso}`, days: g.days + 30, action: "See options", href: "/forecast",
    title: `A ${money(g.cents)} gap to plan for around ${shortDay(g.iso)}`,
    detail: `You have ${g.days} day${g.days === 1 ? "" : "s"} to arrange it: move some savings, shift a payment, or assign a little less elsewhere.`,
  };
}

/** Soonest first, at most five. */
export function orderSteps(steps: Step[]): Step[] {
  return [...steps].sort((a, b) => a.days - b.days).slice(0, 5);
}
