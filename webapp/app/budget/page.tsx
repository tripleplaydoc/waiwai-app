import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { getBudgetSummary, type EnvelopeRow } from "@/lib/budget/summary";
import { formatCents, centsToInput } from "@/lib/utils/currency";
import { monthFromParam, monthLabel, monthParam, shiftMonth } from "@/lib/utils/dates";
import { AssignedInput, AutoAssignButton, AddCategoryButton } from "./budget-controls";

export const dynamic = "force-dynamic";

type SP = Promise<{ ws?: string; month?: string }>;

function availableClass(cents: number) {
  if (cents < 0) return "text-[#DC2626] font-semibold";
  if (cents > 0) return "text-[#059669] font-semibold";
  return "text-slate-400";
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

  const rta = summary.readyToAssignCents;
  const incomeRows = summary.rows.filter((r) => r.type === "INCOME");
  const envelopeGroups = summary.groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => r.type !== "INCOME") }))
    .filter((g) => g.rows.length > 0);
  const hasRanked = summary.rows.some((r) => r.priorityRank !== null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{workspace.name} budget</h1>
        <div className="ml-auto flex items-center gap-1">
          <Link href={`/budget?month=${monthParam(shiftMonth(month, -1))}${wsQ}`} className="btn size-11 !px-0" aria-label="Previous month"><ChevronLeft className="size-4" aria-hidden /></Link>
          <span className="min-w-36 text-center text-sm font-semibold">{monthLabel(month)}</span>
          <Link href={`/budget?month=${monthParam(shiftMonth(month, 1))}${wsQ}`} className="btn size-11 !px-0" aria-label="Next month"><ChevronRight className="size-4" aria-hidden /></Link>
        </div>
      </div>

      <section aria-label="Ready to assign" className={`card flex flex-wrap items-center gap-4 p-6 ${
          rta < 0
            ? "border-red-300 bg-gradient-to-br from-red-50 to-white dark:border-red-900 dark:from-red-950/40 dark:to-slate-900"
            : "bg-gradient-to-br from-emerald-50 via-white to-white dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900"
        }`}>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {rta < 0 ? "Over-assigned" : "Ready to assign"}
          </div>
          <div className={`nums text-4xl font-semibold tracking-tight ${rta < 0 ? "text-[#DC2626]" : "text-[#059669]"}`}>{formatCents(rta)}</div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {rta < 0
              ? "You've assigned more than you've received. Lower an envelope below."
              : rta === 0
                ? "Every dollar has a job."
                : "Income received that hasn't been given to an envelope yet."}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {needsReview > 0 && (
            <Link href={`/accounts${wsKey === "business" ? "?ws=business" : ""}`} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-[#D97706] dark:border-amber-700 dark:bg-amber-950">
              {needsReview} transaction{needsReview === 1 ? "" : "s"} need a category
            </Link>
          )}
          {hasRanked && <AutoAssignButton workspaceId={workspace.id} month={mp} />}
          <AddCategoryButton
            workspaceId={workspace.id}
            isBusiness={workspace.type === "BUSINESS"}
            groups={groupsDb.map((g) => ({ id: g.id, name: g.name }))}
          />
        </div>
      </section>

      {accountCount === 0 && (
        <div className="card p-5 text-sm">
          <strong>Start here:</strong> add an account (checking, savings, card…) on the{" "}
          <Link className="font-medium text-[#4F46E5] underline dark:text-indigo-300" href={`/accounts${wsKey === "business" ? "?ws=business" : ""}`}>Accounts</Link>{" "}
          page, then record your first paycheck as an inflow in an Income category. It will appear above as Ready to assign.
        </div>
      )}

      <section className="card overflow-hidden" aria-label="Envelopes">
        <table className="w-full border-collapse">
          <thead className="border-b border-[#E2E8F0] bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
            <tr>
              <th className="th">Envelope</th>
              <th className="th text-right">Assigned</th>
              <th className="th text-right">Activity</th>
              <th className="th text-right">Available</th>
            </tr>
          </thead>
          <tbody>
            {envelopeGroups.length === 0 && (
              <tr><td colSpan={4} className="td text-slate-500">No envelopes yet. Use “Add category”.</td></tr>
            )}
            {envelopeGroups.map((g) => (
              <GroupRows key={g.id ?? "other"} name={g.name} rows={g.rows} month={mp} />
            ))}
          </tbody>
          <tfoot className="border-t border-[#E2E8F0] bg-slate-50 font-semibold dark:border-slate-800 dark:bg-slate-950/40">
            <tr>
              <td className="td">Totals</td>
              <td className="td nums text-right">{formatCents(summary.totalAssignedCents)}</td>
              <td className="td nums text-right">{formatCents(summary.totalActivityCents)}</td>
              <td className={`td nums text-right ${availableClass(summary.totalAvailableCents)}`}>{formatCents(summary.totalAvailableCents)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {incomeRows.length > 0 && (
        <section className="card overflow-hidden" aria-label="Income">
          <table className="w-full border-collapse">
            <thead className="border-b border-[#E2E8F0] bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
              <tr><th className="th">Income category</th><th className="th text-right">Received this month</th></tr>
            </thead>
            <tbody>
              {incomeRows.map((r) => (
                <tr key={r.id} className="border-b border-[#E2E8F0] last:border-0 dark:border-slate-800">
                  <td className="td">{r.name}</td>
                  <td className="td nums text-right text-[#059669]">{formatCents(r.activityCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function GroupRows({ name, rows, month }: { name: string; rows: EnvelopeRow[]; month: string }) {
  return (
    <>
      <tr className="bg-slate-50 dark:bg-slate-800/40">
        <th colSpan={4} scope="colgroup" className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">{name}</th>
      </tr>
      {rows.map((r) => (
        <tr key={r.id} className="border-b border-[#E2E8F0] last:border-0 transition-colors hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/30">
          <td className="td">
            <span className="font-medium">{r.name}</span>
            {r.priorityRank !== null && <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-[#4F46E5] dark:bg-indigo-950 dark:text-indigo-300">P{r.priorityRank}</span>}
            {r.isSystemManaged && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">system</span>}
          </td>
          <td className="td text-right">
            <AssignedInput categoryId={r.id} month={month} initial={centsToInput(r.assignedCents)} label={`Assigned to ${r.name}`} />
          </td>
          <td className="td nums text-right text-slate-600 dark:text-slate-300">{formatCents(r.activityCents)}</td>
          <td className={`td nums text-right ${availableClass(r.availableCents)}`}>{formatCents(r.availableCents)}</td>
        </tr>
      ))}
    </>
  );
}

