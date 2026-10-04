import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, Target } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { getBudgetSummary, type EnvelopeRow } from "@/lib/budget/summary";
import { budgetHealth, describeMonths, pocketProgress } from "@/lib/budget/targets";
import { billStatus } from "@/lib/budget/bills";
import type { GroupVM, PocketVM } from "@/lib/budget/board-types";
import { formatCents } from "@/lib/utils/currency";
import { monthFromParam, monthLabel, monthParam, shiftMonth, todayIso } from "@/lib/utils/dates";
import { AutoAssignButton } from "./budget-controls";
import { AllocationButton } from "./allocation-dialog";
import { BudgetBoard } from "./budget-board";
import { BillBadge, MarkPaidButton } from "./bill-controls";
import { shortDate } from "@/lib/budget/bills";
import { MoveMoneyHost } from "./move-money-host";
import { IncomeSection } from "./income-section";
import { isCustomKey } from "@/lib/budget/expense-types";
import { DailyVerse } from "@/components/daily-verse";
import { Popover } from "@/components/popover";

export const dynamic = "force-dynamic";

type SP = Promise<{ ws?: string; month?: string }>;

function toVM(r: EnvelopeRow, month: Date, today: string): PocketVM {
  const progress = pocketProgress(
    {
      assignedCents: r.assignedCents, activityCents: r.activityCents, availableCents: r.availableCents,
      targetType: r.targetType, targetCents: r.targetCents, targetDate: r.targetDate ? new Date(`${r.targetDate}T00:00:00.000Z`) : null,
    },
    month
  );
  return {
    id: r.id, name: r.name, groupId: r.groupId, assignedCents: r.assignedCents, activityCents: r.activityCents,
    availableCents: r.availableCents, isSystemManaged: r.isSystemManaged, isTaxDeductible: r.isTaxDeductible,
    priorityRank: r.priorityRank, targetType: r.targetType, targetCents: r.targetCents, targetDate: r.targetDate,
    allocationBps: r.allocationBps, dueDay: r.dueDay, manualPaid: r.manualPaid, kind: r.type, expenseType: r.expenseType, progress,
    bill: r.type === "INCOME" ? null : billStatus({
      dueDay: r.dueDay, monthIso: monthParam(month), todayIso: today, manualPaid: r.manualPaid,
      spentCents: Math.max(0, -r.activityCents), targetCents: r.targetType === "MONTHLY_FUNDING" ? r.targetCents : null,
    }),
  };
}

function Meter({ value, tone }: { value: number; tone: "pos" | "warn" | "neg" | "blue" }) {
  const color = { pos: "bg-pos", warn: "bg-warn", neg: "bg-neg", blue: "bg-[#2E6BE6]" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="presentation">
      <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </div>
  );
}

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

  const today = todayIso();
  const rta = summary.readyToAssignCents;
  const incomeRows = summary.rows.filter((r) => r.type === "INCOME").map((r) => toVM(r, month, today));
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

  const billsList = bills.length === 0 ? (
    <p className="py-1 text-sm text-slate-500">Add a <strong>due day</strong> to a pocket (tap its pencil) to track what&apos;s due and what you&apos;ve paid.</p>
  ) : (
    <>
      <div className="pb-2"><Meter value={billsPaid / bills.length} tone={billsOverdue > 0 ? "neg" : "pos"} /></div>
      <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
        {bills.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
            <div className="flex min-w-0 flex-1 basis-32 flex-col">
              <span className="break-words text-sm font-semibold">{p.name}</span>
              <span className="text-xs text-slate-500">Due {shortDate(p.bill!.dueIso)}{billAmount(p) > 0 ? ` · ${formatCents(billAmount(p))}` : ""}</span>
            </div>
            <BillBadge status={p.bill!} />
            <MarkPaidButton workspaceId={workspace.id} categoryId={p.id} month={mp} status={p.bill!} manualPaid={p.manualPaid} size="md" />
          </li>
        ))}
      </ul>
    </>
  );

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
    <div className="space-y-2.5">
      <DailyVerse />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">{workspace.name} budget</h1>
        {(allPockets.length > 0 || goals.length > 0) && (
          <div className="flex items-center gap-2">
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

      <section aria-label="Budget summary" className="card grid overflow-hidden grid-cols-2 md:grid-cols-[1.3fr_1fr_1fr]">
        {/* Ready to assign */}
        <div className={`col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 md:col-span-1 ${rta < 0 ? "bg-neg-soft/50" : "bg-pos-soft/60 dark:bg-pos-soft/10"}`}>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">{rta < 0 ? "Over-assigned" : "Ready to assign"}</span>
            <span className={`nums text-2xl font-bold leading-tight tracking-tight ${rta < 0 ? "text-neg" : "text-pos"}`}>{formatCents(rta)}</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <AllocationButton workspaceId={workspace.id} month={mp} groups={boardGroups} readyToAssignCents={rta} />
            {hasRanked && <AutoAssignButton workspaceId={workspace.id} month={mp} />}
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

        {/* Months ahead */}
        <div className="flex flex-col justify-center gap-1 border-l border-t border-[#E2E8F0] px-3 py-2 md:border-t-0 dark:border-slate-800" aria-label="Months ahead">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Months ahead</span>
          {health.monthsAhead === null ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">Set monthly costs.</p>
          ) : (
            <>
              <div className="nums text-sm font-bold leading-tight text-[#2E6BE6] dark:text-blue-300" title={`${formatCents(health.pocketMoneyCents)} in pockets vs ${formatCents(health.monthlyCostCents)}/mo`}>{health.monthsAhead.toFixed(1)} mo <span className="text-xs font-medium text-slate-500">· {describeMonths(health.monthsAhead)}</span></div>
              <Meter value={health.monthsAhead / 6} tone="blue" />
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
      {needsReview > 0 && (
        <Link href={`/accounts${wsKey === "business" ? "?ws=business" : ""}`} className="inline-block rounded-xl border border-amber-300 bg-warn-soft px-3 py-2 text-xs font-medium text-warn dark:border-amber-700">
          {needsReview} transaction{needsReview === 1 ? "" : "s"} need a category
        </Link>
      )}

      <MoveMoneyHost hideButton workspaceId={workspace.id} month={mp} pockets={allPockets.filter((p) => !p.isSystemManaged).map((p) => ({ id: p.id, name: p.name, group: boardGroups.find((g) => g.pockets.some((q) => q.id === p.id))?.name ?? "Other", availableCents: p.availableCents }))} />

      <IncomeSection customTypes={customTypes} workspaceId={workspace.id} isBusiness={workspace.type === "BUSINESS"} month={mp} rows={incomeRows} allGroups={allGroups} />

      <BudgetBoard customTypes={customTypes} workspaceId={workspace.id} isBusiness={workspace.type === "BUSINESS"} month={mp} groups={boardGroups} allGroups={allGroups} />

      <section className="card px-5 py-3 text-xs text-slate-500 dark:text-slate-400" aria-label="Totals">
        <span className="nums">Totals this month — assigned {formatCents(summary.totalAssignedCents)} · activity {formatCents(summary.totalActivityCents)} · available {formatCents(summary.totalAvailableCents)}</span>
      </section>
    </div>
  );
}
