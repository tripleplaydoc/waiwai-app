import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, Droplets, Target } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { getBudgetSummary, type EnvelopeRow } from "@/lib/budget/summary";
import { budgetHealth, pocketProgress } from "@/lib/budget/targets";
import { billStatus, DUE_SOON_DAYS } from "@/lib/budget/bills";
import type { GroupVM, PocketVM } from "@/lib/budget/board-types";
import { formatCents } from "@/lib/utils/currency";
import { monthFromParam, monthLabel, monthParam, shiftMonth, todayIso } from "@/lib/utils/dates";
import { AutoAssignButton } from "./budget-controls";
import { AssignButton, FlowPanel } from "./flow-controls";
import { PersonalAssignButton, PersonalFlowPanel } from "./personal-flow-controls";
import { loadPersonalFlow } from "@/lib/budget/personal-flow-state";
import { loadFlow } from "@/lib/budget/waterfall-state";
import { AllocationButton } from "./allocation-dialog";
import { BudgetBoard } from "./budget-board";
import { BillsCalendar, type CalItem } from "./bills-calendar";
import { MoveMoneyHost } from "./move-money-host";
import { CashChip, CashLensProvider, ReadyAmount } from "./cash-lens";
import { loadCashView } from "@/lib/budget/funding";
import { toVM } from "@/lib/budget/to-vm";
import { isCustomKey } from "@/lib/budget/expense-types";
import { DailyVerse } from "@/components/daily-verse";
import { Popover } from "@/components/popover";

export const dynamic = "force-dynamic";

type SP = Promise<{ ws?: string; month?: string }>;

function Meter({ value, tone }: { value: number; tone: "pos" | "warn" | "neg" | "blue" }) {
  const color = { pos: "bg-pos", warn: "bg-warn", neg: "bg-neg", blue: "bg-[#2E6BE6]" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="presentation">
      <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </div>
  );
}

import { loadCardStatuses } from "@/lib/budget/cards";
import { inDays, shortDate as cycleDate } from "@/lib/cycle";

export default async function BudgetPage({ searchParams }: { searchParams: SP }) {
  await requireAuth();
  const sp = await searchParams;
  const wsKey = wsKeyFromParam(sp.ws);
  const workspace = await getWorkspace(wsKey);
  const month = monthFromParam(sp.month);
  const mp = monthParam(month);
  const wsQ = wsKey === "business" ? "&ws=business" : "";

  const [summary, needsReview, accountCount, groupsDb] = await Promise.all([
    getBudgetSummary(workspace.id, month),
    prisma.transaction.count({ where: { workspaceId: workspace.id, needsReview: true } }),
    prisma.account.count({ where: { workspaceId: workspace.id, isArchived: false } }),
    prisma.categoryGroup.findMany({ where: { workspaceId: workspace.id, isArchived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  const cardStatuses = await loadCardStatuses(workspace.id, month);
  const cardsShort = cardStatuses.filter((c) => c.shortCents > 0);
  const cardsDue = cardStatuses.filter((c) => c.owedCents > 0 && c.nextDue && c.nextDue.days <= 5);
  const isPersonal = workspace.type === "PERSONAL";
  const { vm: flow } = await loadFlow(workspace.id, month, summary.rows);
  const pflow = isPersonal ? (await loadPersonalFlow(workspace.id, month, summary.rows)).vm : null;
  const flowOn = pflow ? pflow.enabled : flow.enabled;
  const today = todayIso();
  const rta = summary.readyToAssignCents;
  const expenseRows = summary.rows.filter((r) => r.type !== "INCOME");

  // Board groups: every category that isn't income-only (empty ones stay visible).
  const boardGroups: GroupVM[] = summary.groups
    .map((g) => ({
      id: g.id ?? "__none",
      name: g.name,
      allocationBps: g.allocationBps,
      pockets: g.rows.filter((r) => r.type !== "INCOME").map((r) => toVM(r, month, today)),
      hasIncome: g.rows.some((r) => r.type === "INCOME"),
    }))
    .filter((g) => !(g.hasIncome && g.pockets.length === 0) && !(g.id === "__none" && g.pockets.length === 0))
    .map(({ hasIncome: _h, ...g }) => g);
  const customTypes = [...new Set(summary.rows.map((r) => r.expenseType).filter((k): k is string => !!k && isCustomKey(k)))].sort();
  const allGroups = groupsDb.map((g) => ({ id: g.id, name: g.name }));

  const allPockets = boardGroups.flatMap((g) => g.pockets);
  const cash = await loadCashView(prisma, workspace.id, month, allPockets.map((p) => ({ id: p.id, availableCents: p.availableCents })));
  const health = budgetHealth(
    allPockets.map((p) => ({
      input: { assignedCents: p.assignedCents, activityCents: p.activityCents, availableCents: p.availableCents, targetType: p.targetType, targetCents: p.targetCents, targetDate: p.targetDate ? new Date(`${p.targetDate}T00:00:00.000Z`) : null },
      progress: p.progress,
    })),
    rta
  );
  const goals = allPockets.filter((p) => p.targetType === "TARGET_BALANCE" || p.targetType === "TARGET_BALANCE_BY_DATE");
  const bills = allPockets
    .filter((p) => p.bill)
    .sort((a, b) => Number(a.bill!.state === "paid") - Number(b.bill!.state === "paid") || a.bill!.dueIso.localeCompare(b.bill!.dueIso));
  const billsPaid = bills.filter((p) => p.bill!.state === "paid").length;
  const billsOverdue = bills.filter((p) => p.bill!.state === "overdue").length;
  const billAmount = (p: PocketVM) => (p.targetType === "MONTHLY_FUNDING" && p.targetCents ? p.targetCents : Math.max(p.assignedCents, 0));
  const billsStillDue = bills.filter((p) => p.bill!.state !== "paid").reduce((s, p) => s + billAmount(p), 0);
  const hasRanked = expenseRows.some((r) => r.priorityRank !== null);
  const anyTargets = health.monthlyCostCents > 0 || health.stillNeededCents > 0 || goals.length > 0;

  const calItems: CalItem[] = [
    ...bills.map((p): CalItem => ({ id: p.id, kind: "pocket", name: p.name, dueIso: p.bill!.dueIso, amountCents: billAmount(p), status: p.bill!, manualPaid: p.manualPaid })),
    // Card payments due this month (only ones with a balance; the date comes from the card's due day).
    ...cardStatuses
      .filter((c) => c.owedCents > 0 && c.nextDue && c.nextDue.iso.startsWith(mp))
      .map((c): CalItem => ({
        id: `card-${c.id}`, kind: "card", name: c.name, dueIso: c.nextDue!.iso, amountCents: c.owedCents, manualPaid: false,
        href: `/accounts/${c.id}${wsKey === "business" ? "?ws=business" : ""}`,
        status: { state: c.nextDue!.days <= DUE_SOON_DAYS ? "due_soon" : "upcoming", dueIso: c.nextDue!.iso, daysUntil: c.nextDue!.days, autoPaid: false },
      })),
  ];
  const billsList = <BillsCalendar workspaceId={workspace.id} monthIso={mp} todayIso={today} items={calItems} />;

  const goalsList = (
    <ul className="grid gap-3">
      {goals.map((p) => {
        const pr = p.progress;
        const by = p.targetDate ? new Date(`${p.targetDate}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : null;
        return (
          <li key={p.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-semibold">{p.name}</span>
              <span className="nums text-xs text-slate-500">{formatCents(Math.max(0, p.availableCents))} / {formatCents(pr.targetCents)}</span>
            </div>
            <Meter value={pr.progress} tone={pr.state === "overspent" ? "neg" : pr.stillNeededCents === 0 ? "pos" : "warn"} />
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {by ? <>By <strong>{by}</strong>: <strong className="nums">{formatCents(pr.needThisMonthCents)}</strong>/mo{pr.monthsLeft ? ` (${pr.monthsLeft} left)` : ""}. </> : <>Build to <strong className="nums">{formatCents(pr.targetCents)}</strong>. </>}
              {pr.stillNeededCents > 0 ? <span className="text-warn">Need {formatCents(pr.stillNeededCents)} more this month.</span> : <span className="text-pos">On track.</span>}
            </p>
          </li>
        );
      })}
    </ul>
  );

  const coverText = health.stillNeededCents === 0 ? "Everything funded" : health.canCover ? "You can cover it" : `Short ${formatCents(health.shortfallCents)}`;

  return (
    <CashLensProvider cash={cash}>
    <div className="space-y-2.5">
      <DailyVerse />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">{workspace.name} budget</h1>
        {(allPockets.length > 0 || goals.length > 0) && (
          <div className="flex items-center gap-2">
            <Popover icon={<Droplets className="size-3.5 text-[#2E6BE6]" aria-hidden />} label={!isPersonal && flow.enabled && flow.owedCents > 0 ? <>Flow <span className="rounded-full bg-warn-soft px-1.5 text-warn">owes</span></> : "Flow"}>
              {pflow ? <PersonalFlowPanel workspaceId={workspace.id} flow={pflow} /> : <FlowPanel workspaceId={workspace.id} month={mp} flow={flow} />}
            </Popover>
            <Popover
              icon={<CalendarClock className="size-3.5 text-[#2E6BE6]" aria-hidden />}
              label={bills.length > 0 ? <>Bills {billsPaid}/{bills.length}{billsOverdue > 0 && <span className="rounded-full bg-neg-soft px-1.5 text-neg">{billsOverdue} overdue</span>}</> : "Bills"}
            >
              <div className="mb-1 flex items-baseline justify-between text-xs text-slate-500">
                <span className="font-bold text-slate-800 dark:text-slate-100">Bills</span>
                {billsStillDue > 0 && <span className="nums">≈ {formatCents(billsStillDue)} to pay</span>}
              </div>
              {billsList}
            </Popover>
            <CashChip workspaceId={workspace.id} month={mp} />
            {goals.length > 0 && (
              <Popover icon={<Target className="size-3.5 text-[#2E6BE6]" aria-hidden />} label={<>Goals {goals.length}</>}>
                <p className="mb-2 text-xs font-bold text-slate-800 dark:text-slate-100">Goals</p>
                {goalsList}
              </Popover>
            )}
          </div>
        )}
        <div className="flex w-full items-center justify-between sm:ml-auto sm:w-auto">
          <Link href={`/budget?month=${monthParam(shiftMonth(month, -1))}${wsQ}`} className="btn size-10 !px-0" aria-label="Previous month"><ChevronLeft className="size-4" aria-hidden /></Link>
          <span className="min-w-28 text-center text-sm font-semibold">{monthLabel(month)}</span>
          <Link href={`/budget?month=${monthParam(shiftMonth(month, 1))}${wsQ}`} className="btn size-10 !px-0" aria-label="Next month"><ChevronRight className="size-4" aria-hidden /></Link>
        </div>
      </div>

      <section aria-label="Budget summary" className="card grid overflow-hidden grid-cols-1 md:grid-cols-[1.3fr_1fr]">
        {/* Ready to assign */}
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 ${rta < 0 ? "bg-neg-soft/50" : "bg-pos-soft/60 dark:bg-pos-soft/10"}`}>
          <ReadyAmount rtaCents={rta} />
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {flowOn ? (
              pflow ? <PersonalAssignButton workspaceId={workspace.id} month={mp} disabled={rta <= 0} /> : <AssignButton workspaceId={workspace.id} month={mp} disabled={rta <= 0} />
            ) : (
              <>
                <AllocationButton workspaceId={workspace.id} month={mp} groups={boardGroups} readyToAssignCents={rta} />
                {hasRanked && <AutoAssignButton workspaceId={workspace.id} month={mp} />}
              </>
            )}
          </div>
        </div>

        {/* Can I cover it */}
        <div className="flex flex-col justify-center gap-1 border-t border-[#E2E8F0] px-3 py-2 md:border-l md:border-t-0 dark:border-slate-800" aria-label="Can I cover this month">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Cover this month?</span>
          {!anyTargets ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">Add a monthly cost or goal.</p>
          ) : (
            <>
              <div className={`text-sm font-bold leading-tight ${health.canCover ? "text-pos" : "text-warn"}`} title={`Still to assign ${formatCents(health.stillNeededCents)} of ${formatCents(health.monthlyCostCents + health.goalPaceCents)} needed`}>{coverText}</div>
              <Meter value={health.stillNeededCents === 0 ? 1 : Math.max(0, rta) / health.stillNeededCents} tone={health.canCover ? "pos" : "warn"} />
            </>
          )}
        </div>

      </section>

      {accountCount === 0 && (
        <div className="card p-5 text-sm">
          <strong>Start here:</strong> add an account (checking, savings, card…) on the{" "}
          <Link className="font-medium text-[#2E6BE6] underline dark:text-blue-300" href={`/accounts${wsKey === "business" ? "?ws=business" : ""}`}>Accounts</Link>{" "}
          page, then record your first paycheck as an inflow in an Income category. It will appear above as Ready to assign.
          {needsReview > 0 && null}
        </div>
      )}
      {cardsShort.map((c) => (
        <Link key={c.id} href={`/accounts/${c.id}${wsKey === "business" ? "?ws=business" : ""}`} className="block rounded-xl border border-red-300 bg-neg-soft px-3 py-2 text-xs font-medium text-neg dark:border-red-800">
          {c.name} is {formatCents(c.shortCents)} short: money spent on it isn&apos;t set aside yet. Tap to fix.
        </Link>
      ))}
      {cardsDue.map((c) => (
        <Link key={`due-${c.id}`} href={`/accounts/${c.id}${wsKey === "business" ? "?ws=business" : ""}`} className="block rounded-xl border border-amber-300 bg-warn-soft px-3 py-2 text-xs font-medium text-warn dark:border-amber-700">
          {c.name} payment is due {inDays(c.nextDue!.days)} ({cycleDate(c.nextDue!.iso)}). You owe {formatCents(c.owedCents)}.
        </Link>
      ))}
      {needsReview > 0 && (
        <Link href={`/accounts${wsKey === "business" ? "?ws=business" : ""}`} className="inline-block rounded-xl border border-amber-300 bg-warn-soft px-3 py-2 text-xs font-medium text-warn dark:border-amber-700">
          {needsReview} transaction{needsReview === 1 ? "" : "s"} need a category
        </Link>
      )}

      <MoveMoneyHost hideButton workspaceId={workspace.id} month={mp} readyToAssignCents={rta} pockets={allPockets.filter((p) => !p.isSystemManaged).map((p) => ({ id: p.id, name: p.name, group: boardGroups.find((g) => g.pockets.some((q) => q.id === p.id))?.name ?? "Other", availableCents: p.availableCents, assignedCents: p.assignedCents }))} />


      <BudgetBoard customTypes={customTypes} workspaceId={workspace.id} isBusiness={workspace.type === "BUSINESS"} month={mp} groups={boardGroups} allGroups={allGroups} />

      <section className="card px-5 py-3 text-xs text-slate-500 dark:text-slate-400" aria-label="Totals">
        <span className="nums">Totals this month — assigned {formatCents(summary.totalAssignedCents)} · activity {formatCents(summary.totalActivityCents)} · available {formatCents(summary.totalAvailableCents)}</span>
      </section>
    </div>
    </CashLensProvider>
  );
}
