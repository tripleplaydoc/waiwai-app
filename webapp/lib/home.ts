import "server-only";
import { prisma } from "@/lib/prisma";
import { getBudgetSummary, type EnvelopeRow } from "@/lib/budget/summary";
import { billStatus } from "@/lib/budget/bills";
import { loadCardStatuses } from "@/lib/budget/cards";
import { loadLoans } from "@/lib/budget/loans-state";
import { loadRecurring } from "@/lib/recurring";
import { loadForecast, type ForecastVM } from "@/lib/forecast";
import { accountKind } from "@/lib/account-kind";
import { addDays, daysBetween, type ForecastEvent } from "@/lib/forecast-math";
import { billStep, buildWins, cardCloseStep, cardDueStep, gapStep, greeting, orderSteps, recurringStep, sortStep, type Step, type Win } from "@/lib/home-math";
import { isoToDate, todayIso } from "@/lib/utils/dates";

export interface HomeVM {
  greeting: string;
  cashCents: number;
  accounts: { id: string; name: string; kind: string | undefined; cents: number }[];
  /** First day the forecast dips below zero (a gap to plan for), if any. */
  gap: { iso: string; cents: number; days: number } | null;
  wins: Win[];
  coming: { inEvents: ForecastEvent[]; outEvents: ForecastEvent[]; inCents: number; outCents: number };
  steps: Step[];
}

function hourNow(): number {
  return +(new Intl.DateTimeFormat("en-US", { timeZone: process.env.APP_TIMEZONE || "Pacific/Honolulu", hour: "numeric", hour12: false }).format(new Date())) % 24;
}

/** Everything the Home screen shows for one workspace: what is good first, then the gentle next steps. */
export async function loadHome(workspaceId: string, firstName: string, opts: { today?: string; wsQ?: string } = {}): Promise<HomeVM & { forecast: ForecastVM; rows: EnvelopeRow[] }> {
  const today = opts.today ?? todayIso();
  const q = opts.wsQ ? `?${opts.wsQ.replace(/^[?&]/, "")}` : "";
  const month = isoToDate(`${today.slice(0, 7)}-01`);
  const summary = await getBudgetSummary(workspaceId, month);
  const [recurring, loans, cards, needsReview, anyTx] = await Promise.all([
    loadRecurring(workspaceId, today),
    loadLoans(workspaceId, today.slice(0, 7), summary.rows, false),
    loadCardStatuses(workspaceId, month),
    prisma.transaction.count({ where: { workspaceId, needsReview: true } }),
    prisma.transaction.count({ where: { workspaceId } }),
  ]);
  const forecast = await loadForecast(workspaceId, { today, summary, loans, recurring, wsQ: q });
  const kinds = await accountKinds(forecast.accounts.map((a) => a.id));

  // What changed this week (cash accounts only, moves between your own accounts don't count).
  const cashIds = new Set(forecast.accounts.map((a) => a.id));
  const weekAgo = addDays(today, -7);
  const recent = await prisma.transaction.findMany({
    where: { workspaceId, date: { gt: isoToDate(weekAgo), lte: isoToDate(today) } },
    select: { date: true, amountCents: true, accountId: true, transferAccountId: true },
  });
  const weekChange = recent.filter((t) => cashIds.has(t.accountId) && !(t.transferAccountId && cashIds.has(t.transferAccountId))).reduce((s, t) => s + t.amountCents, 0);
  const activeDays = new Set(recent.map((t) => t.date.toISOString().slice(0, 10))).size;

  const bills = summary.rows
    .filter((r) => r.type === "EXPENSE" && r.dueDay !== null && !r.isSystemManaged)
    .map((r) => billStatus({ dueDay: r.dueDay, monthIso: today.slice(0, 7), todayIso: today, manualPaid: r.manualPaid, spentCents: Math.max(0, -r.activityCents), targetCents: r.targetCents }))
    .filter((b): b is NonNullable<typeof b> => b !== null);
  const expense = summary.rows.filter((r) => r.type === "EXPENSE" && !r.isSystemManaged);

  const week = addDays(today, 7);
  const upcoming = forecast.events.filter((e) => e.date <= week);
  const inEvents = upcoming.filter((e) => e.cents > 0);
  const outEvents = upcoming.filter((e) => e.cents < 0);
  const inCents = inEvents.reduce((s, e) => s + e.cents, 0);
  const outCents = outEvents.reduce((s, e) => s - e.cents, 0);

  const wins = buildWins({
    weekChangeCents: weekChange,
    comingInCents: inCents,
    readyToAssignCents: summary.readyToAssignCents,
    cardUse: cards.filter((c) => c.limitCents && c.limitCents > 0).map((c) => ({ name: c.name, pct: Math.round((c.owedCents / (c.limitCents as number)) * 100) })),
    billsPaid: bills.filter((b) => b.state === "paid").length, billsTotal: bills.length,
    noOverspent: expense.length > 0 && expense.every((r) => r.availableCents >= 0),
    allSorted: anyTx > 0 && needsReview === 0,
    activeDays,
  });

  const steps: Step[] = [];
  for (const c of cards) {
    const p = c.plan;
    if (p.closeAlert && p.payByIso) steps.push(cardCloseStep({ id: c.id, name: c.name, payDownCents: p.payDownCents, payByDays: Math.max(0, p.payByDays ?? 0), payByIso: p.payByIso, reportedPct: p.reportedPct, href: `/accounts/${c.id}${q}` }));
    if (p.dueAlert && c.nextDue) steps.push(cardDueStep({ id: c.id, name: c.name, owedCents: c.owedCents, dueDays: c.nextDue.days, dueIso: c.nextDue.iso, href: `/accounts/${c.id}${q}` }));
  }
  for (const r of recurring.filter((r) => r.isActive && !r.autoPost && r.dueDates.length > 0)) steps.push(recurringStep({ payee: r.payee, amountCents: r.amountCents, href: `/recurring${q}` }));
  if (needsReview > 0) steps.push(sortStep(needsReview, `/accounts${q}`));
  for (const e of forecast.events.filter((e) => (e.kind === "bill" || e.kind === "loan") && e.remindDays !== undefined)) {
    const days = daysBetween(today, e.dueDate < today ? today : e.dueDate);
    if (days <= (e.remindDays ?? 3)) steps.push(billStep({ id: e.id, label: e.label.replace(/ payment$/, ""), cents: -e.cents, days, iso: e.dueDate, late: e.dueDate < today, href: e.href ?? `/budget${q}` }));
  }
  const fs = forecast.firstShort;
  const gap = fs ? { iso: fs.date, cents: -fs.cents, days: daysBetween(today, fs.date) } : null;
  if (gap) steps.push(gapStep({ cents: -forecast.low.cents, iso: gap.iso, days: gap.days }));

  return {
    greeting: greeting(hourNow(), firstName),
    cashCents: forecast.startCents,
    accounts: forecast.accounts.map((a) => ({ id: a.id, name: a.name, kind: kinds.get(a.id), cents: a.cents })),
    gap, wins,
    coming: { inEvents, outEvents, inCents, outCents },
    steps: orderSteps(steps),
    forecast,
    rows: summary.rows,
  };
}

/** Account type per id, for the "debit / cash in hand" labels. */
export async function accountKinds(ids: string[]): Promise<Map<string, string | undefined>> {
  const rows = await prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, type: true } });
  return new Map(rows.map((r) => [r.id, accountKind(r.type)]));
}
