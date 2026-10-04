import Link from "next/link";
import { Donut } from "@/components/donut";
import { expenseBreakdown } from "@/lib/reports/breakdown";
import { TAG_DEFS, type ExpenseTagKey } from "@/lib/budget/expense-tags";
import { formatCents } from "@/lib/utils/currency";

const VIEWS = [["category", "By category"], ["type", "By type"], ["tag", "By tag"]] as const;

export async function ExpensesTab({ workspaceId, from, to, by, baseQuery }: { workspaceId: string; from: string; to: string; by: string; baseQuery: string }) {
  const b = await expenseBreakdown(workspaceId, from, to);
  const view = VIEWS.some(([k]) => k === by) ? by : "category";
  const slices = view === "category" ? b.byCategory : view === "type" ? b.byType
    : b.byTag.map((s) => ({ ...s, color: s.key in TAG_DEFS ? TAG_DEFS[s.key as ExpenseTagKey].dot : "#CBD5E1" }));
  return (
    <section className="card p-4 sm:p-5" aria-label="Where the money went">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold tracking-tight">Where the money went</h2>
        <div className="ml-auto flex gap-1.5" role="tablist" aria-label="Group expenses">
          {VIEWS.map(([k, l]) => (
            <Link key={k} role="tab" aria-selected={view === k} href={`/reports?${baseQuery}&tab=expenses&by=${k}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${view === k ? "border-navy bg-navy text-white" : "border-[#E2E8F0] bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}>{l}</Link>
          ))}
        </div>
      </div>
      <Donut slices={slices} centerLabel="Spent" centerValue={formatCents(view === "tag" ? b.totalCents : slices.reduce((s, x) => s + x.cents, 0))} />
      {view === "tag" && (
        <p className="mt-3 text-xs text-slate-500">An expense with several tags counts under each of them, so the slices can add up to more than the total. Tap an expense on its account page to tag it.</p>
      )}
      {view === "category" && <p className="mt-3 text-xs text-slate-500">Tap a category to see the pockets inside it.</p>}
    </section>
  );
}
