import { prisma } from "@/lib/prisma";
import { getBudgetSummary } from "@/lib/budget/summary";
import { toVM } from "@/lib/budget/to-vm";
import { isCustomKey } from "@/lib/budget/expense-types";
import { startOfMonthUTC } from "@/lib/budget/dates";
import { IncomeSection } from "@/app/budget/income-section";

/** Where income sources are added and tagged (earned / portfolio / passive). Money itself is added as an inflow transaction. */
export async function IncomeSources({ workspaceId, today }: { workspaceId: string; today: string }) {
  const month = startOfMonthUTC(new Date(`${today}T00:00:00.000Z`));
  const [ws, summary, groups] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { type: true } }),
    getBudgetSummary(workspaceId, month),
    prisma.categoryGroup.findMany({ where: { workspaceId, isArchived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const rows = summary.rows.filter((r) => r.type === "INCOME").map((r) => toVM(r, month, today));
  const customTypes = [...new Set(summary.rows.map((r) => r.expenseType).filter((k): k is string => !!k && isCustomKey(k)))].sort();
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-500">Add money with <strong>Add transaction → Inflow</strong>. Income sources live here: add one, or tap the pencil to mark it earned, portfolio or passive.</p>
      <IncomeSection customTypes={customTypes} workspaceId={workspaceId} isBusiness={ws?.type === "BUSINESS"} month={`${today.slice(0, 7)}`} rows={rows} allGroups={groups} />
    </div>
  );
}
