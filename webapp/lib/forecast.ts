import "server-only";
import { prisma } from "@/lib/prisma";
import { getBudgetSummary, type BudgetSummary } from "@/lib/budget/summary";
import { loadLoans } from "@/lib/budget/loans-state";
import type { LoanVM } from "@/lib/budget/loans-types";
import { loadRecurring, type RecurringVM } from "@/lib/recurring";
import { billStatus, dueDateFor } from "@/lib/budget/bills";
import { loanDueIso } from "@/lib/loans";
import { payeeKey } from "@/lib/coach/leaks-math";
import { isoToDate, todayIso } from "@/lib/utils/dates";
import { addDays, buildForecast, cardEvents, occurrences, type Forecast, type ForecastEvent } from "@/lib/forecast-math";

export const FORECAST_DAYS = 60;

export interface ForecastVM extends Forecast {
  today: string;
  end: string;
  accounts: { id: string; name: string; cents: number }[];
  /** Any money coming in is known (a repeating deposit or a dated deposit). */
  hasIncome: boolean;
  /** Every event the forecast was built from, in date order (reminders use this). */
  events: ForecastEvent[];
}

/** Two names that are the same thing ("Netflix" / "NETFLIX.COM 888-..."): used so a bill isn't counted twice. */
function sameName(a: string, b: string): boolean {
  const ka = payeeKey(a), kb = payeeKey(b);
  if (!ka || !kb) return false;
  return ka === kb || (ka.length >= 4 && kb.includes(ka)) || (kb.length >= 4 && ka.includes(kb));
}

/**
 * The next `days` days of cash for one workspace, from what is already known: repeating deposits and charges, loan payments,
 * bills with a due day, credit card payments (following the pay-before-close plan) and anything already dated in the future.
 * Everyday spending that isn't set up as repeating is not predicted.
 */
export async function loadForecast(workspaceId: string, opts: { days?: number; today?: string; summary?: BudgetSummary; loans?: LoanVM[]; recurring?: RecurringVM[]; wsQ?: string } = {}): Promise<ForecastVM> {
  const today = opts.today ?? todayIso();
  const horizon = opts.days ?? FORECAST_DAYS;
  const end = addDays(today, horizon);
  const q = opts.wsQ ? `?${opts.wsQ.replace(/^[?&]/, "")}` : "";
  const todayDate = isoToDate(today);
  const monthIso = today.slice(0, 7);

  const accounts = await prisma.account.findMany({
    where: { workspaceId, onBudget: true, isArchived: false, balanceMode: "TRANSACTION_DERIVED" },
    include: { holdingDetail: { select: { statementDay: true, dueDay: true } } },
    orderBy: { name: "asc" },
  });
  const cash = accounts.filter((a) => a.type !== "CREDIT_CARD");
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD");
  const cashIds = new Set(cash.map((a) => a.id));
  const cardIds = new Set(cards.map((a) => a.id));
  const ids = accounts.map((a) => a.id);

  const summary = opts.summary ?? await getBudgetSummary(workspaceId, isoToDate(`${monthIso}-01`));
  const [sums, future, recurring, loans, loanPockets, limits] = await Promise.all([
    prisma.transaction.groupBy({ by: ["accountId"], where: { accountId: { in: ids }, date: { lte: todayDate } }, _sum: { amountCents: true } }),
    prisma.transaction.findMany({
      where: { workspaceId, accountId: { in: ids }, date: { gt: todayDate, lte: isoToDate(end) } },
      select: { id: true, date: true, amountCents: true, accountId: true, transferAccountId: true, transferGroupId: true, memo: true, payee: { select: { name: true } }, transferAccount: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    opts.recurring ? Promise.resolve(opts.recurring) : loadRecurring(workspaceId, today),
    opts.loans ? Promise.resolve(opts.loans) : loadLoans(workspaceId, monthIso, summary.rows, false),
    prisma.category.findMany({ where: { workspaceId, loanAccountId: { not: null } }, select: { id: true } }),
    prisma.creditLimit.findMany({ where: { accountId: { in: cards.map((c) => c.id) } } }).catch(() => [] as { accountId: string; limitCents: number }[]),
  ]);

  const balance = (a: (typeof accounts)[number]) =>
    (!a.openingBalanceDate || a.openingBalanceDate <= todayDate ? a.openingBalanceCents : 0) + (sums.find((s) => s.accountId === a.id)?._sum.amountCents ?? 0);

  const events: ForecastEvent[] = [];
  const charges = new Map<string, { date: string; cents: number }[]>(); // per card: + adds to what is owed
  const charge = (cardId: string, date: string, cents: number) => charges.set(cardId, [...(charges.get(cardId) ?? []), { date, cents }]);

  // Things already dated in the future (not moves between your own cash accounts, and not the card side of a payment).
  for (const t of future) {
    const date = t.date.toISOString().slice(0, 10);
    if (cashIds.has(t.accountId)) {
      if (t.transferAccountId && cashIds.has(t.transferAccountId)) continue;
      if (t.transferAccountId && cardIds.has(t.transferAccountId)) charge(t.transferAccountId, date, t.amountCents);
      events.push({ id: `tx:${t.id}`, date, dueDate: date, label: t.payee?.name ?? (t.transferAccount ? `To ${t.transferAccount.name}` : t.memo || "Dated transaction"), cents: t.amountCents, kind: t.amountCents > 0 ? "income" : "scheduled" });
    } else if (cardIds.has(t.accountId) && !t.transferGroupId) {
      charge(t.accountId, date, -t.amountCents);
    }
  }

  // Repeating deposits and charges.
  const active = recurring.filter((r) => r.isActive);
  for (const r of active) {
    const onCard = cardIds.has(r.accountId);
    if (!onCard && !cashIds.has(r.accountId)) continue;
    for (const o of occurrences(r.nextDate, r.frequency, r.anchorDay, today, end, r.endDate)) {
      if (onCard) { charge(r.accountId, o.date, -r.amountCents); continue; }
      events.push({
        id: `rec:${r.id}`, date: o.date, dueDate: o.dueDate, label: r.payee, cents: r.amountCents, kind: r.amountCents > 0 ? "income" : "recurring",
        href: `/recurring${q}`, detail: r.autoPost ? undefined : "waiting for you to post it", remindDays: r.autoPost ? undefined : 0,
      });
    }
  }
  const recurringNames = active.map((r) => r.payee);
  const isRepeating = (name: string) => recurringNames.some((n) => sameName(n, name));

  // Loan payments.
  for (const l of loans) {
    if (l.phase === "finished" || l.phase === "unset" || l.paymentCents <= 0 || !l.firstDueIso || !l.numPayments) continue;
    if (isRepeating(l.name)) continue;
    for (let i = l.paymentsDone; i < l.numPayments; i++) {
      const due = loanDueIso(l.firstDueIso, i);
      if (due > end) break;
      // Without a pocket there is no way to tell whether this month's payment was already made: don't guess it is late.
      if (i === l.paymentsDone && !l.onBudget && due <= today) continue;
      events.push({
        id: `loan:${l.accountId}`, date: due < today ? today : due, dueDate: due, label: `${l.name} payment`, cents: -l.paymentCents, kind: "loan",
        href: `/accounts/${l.accountId}${q}`, detail: due < today ? "overdue" : undefined, remindDays: 3,
      });
    }
  }

  // Bills with a due day on the budget (loan pockets are covered above).
  const skipPocket = new Set(loanPockets.map((p) => p.id));
  const months: string[] = [];
  for (let m = monthIso; m <= end.slice(0, 7); m = addDays(`${m}-28`, 7).slice(0, 7)) months.push(m);
  for (const r of summary.rows) {
    if (r.type !== "EXPENSE" || r.dueDay === null || r.dueDay < 1 || r.isSystemManaged || skipPocket.has(r.id)) continue;
    const amount = r.targetType === "MONTHLY_FUNDING" && r.targetCents ? r.targetCents : Math.max(r.assignedCents, 0);
    if (amount <= 0 || isRepeating(r.name)) continue;
    for (const m of months) {
      let due = dueDateFor(m, r.dueDay);
      if (m === monthIso) {
        const st = billStatus({ dueDay: r.dueDay, monthIso: m, todayIso: today, manualPaid: r.manualPaid, spentCents: Math.max(0, -r.activityCents), targetCents: r.targetCents });
        if (!st || st.state === "paid") continue;
        due = st.dueIso;
      }
      if (due > end) continue;
      const date = due < today ? today : due;
      if (r.paidFromId && cardIds.has(r.paidFromId)) { charge(r.paidFromId, date, amount); continue; }
      events.push({ id: `bill:${r.id}:${m}`, date, dueDate: due, label: r.name, cents: -amount, kind: "bill", href: `/budget${q}`, detail: due < today ? "overdue" : undefined, remindDays: 3 });
    }
  }

  // Credit card payments.
  for (const c of cards) {
    events.push(...cardEvents({
      id: c.id, name: c.name, owedCents: Math.max(0, -balance(c)), limitCents: limits.find((l) => l.accountId === c.id)?.limitCents ?? null,
      statementDay: c.holdingDetail?.statementDay ?? null, dueDay: c.holdingDetail?.dueDay ?? null, charges: charges.get(c.id) ?? [], today, end, href: `/accounts/${c.id}${q}`,
    }));
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || b.cents - a.cents);
  const accts = cash.map((a) => ({ id: a.id, name: a.name, cents: balance(a) }));
  const forecast = buildForecast({ today, horizon, startCents: accts.reduce((s, a) => s + a.cents, 0), events });
  return { ...forecast, today, end, accounts: accts, hasIncome: events.some((e) => e.cents > 0), events };
}
