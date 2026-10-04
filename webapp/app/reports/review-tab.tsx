import { loadReview } from "@/lib/reports/review";
import { formatCents } from "@/lib/utils/currency";
import { ReviewRowView } from "./review-row";

const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Bar({ parts, total }: { parts: { label: string; cents: number; color: string }[]; total: number }) {
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="presentation">
        {parts.map((p) => p.cents > 0 && <div key={p.label} style={{ width: `${(p.cents / Math.max(1, total)) * 100}%`, background: p.color }} />)}
      </div>
      <ul className="mt-1.5 space-y-0.5 text-xs">
        {parts.map((p) => <li key={p.label} className="flex items-center gap-2"><i className="size-2.5 rounded-sm" style={{ background: p.color }} /><span className="flex-1 text-slate-600 dark:text-slate-300">{p.label}</span><span className="nums font-semibold">{formatCents(p.cents)}</span></li>)}
      </ul>
    </div>
  );
}

export async function ReviewTab({ workspaceId, from, to, label, onlyTodo, baseQuery }: { workspaceId: string; from: string; to: string; label: string; onlyTodo: boolean; baseQuery: string }) {
  const { rows, summary: s, truncated } = await loadReview(workspaceId, from, to);
  const shown = onlyTodo ? rows.filter((r) => !r.review || (!r.review.increasesRevenue && !r.review.stewardship && r.review.strategicValue.length === 0)) : rows;
  const GREEN = "#059669", RED = "#DC2626", AMBER = "#D97706", GREY = "#CBD5E1", BLUE = "#2563EB";
  return (
    <div className="space-y-4">
      <section className="card p-4" aria-label="Monthly expense review">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-base font-bold tracking-tight">Expense review</h2>
          <span className="text-xs text-slate-500">{label}</span>
          <span className="nums ml-auto text-sm font-semibold">{s.reviewed} of {s.count} reviewed</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="presentation"><div className="h-full rounded-full bg-pos" style={{ width: `${s.count ? (s.reviewed / s.count) * 100 : 0}%` }} /></div>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">For each expense: does it increase revenue or profitability? What is its strategic value? Is it fair, responsible and consistent with the business you want to build?</p>
      </section>

      {s.count > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <section className="card p-4"><h3 className="mb-2 text-sm font-bold">Increases revenue or profit?</h3>
            <Bar total={s.totalCents} parts={[{ label: "Yes", cents: s.revenue.YES, color: GREEN }, { label: "Not sure", cents: s.revenue.UNSURE, color: AMBER }, { label: "No", cents: s.revenue.NO, color: RED }, { label: "Not reviewed", cents: s.revenue.UNANSWERED, color: GREY }]} /></section>
          <section className="card p-4"><h3 className="mb-2 text-sm font-bold">Strategic value</h3>
            <Bar total={s.totalCents} parts={[{ label: "Improves capacity", cents: s.value.CAPACITY, color: BLUE }, { label: "Reduces risk", cents: s.value.RISK, color: "#7C3AED" }, { label: "Strengthens the business", cents: s.value.STRENGTH, color: GREEN }, { label: "None chosen", cents: s.value.NONE, color: GREY }]} />
            <p className="mt-1 text-[11px] text-slate-500">An expense counts under each value it has.</p></section>
          <section className="card p-4"><h3 className="mb-2 text-sm font-bold">Stewardship</h3>
            <Bar total={s.totalCents} parts={[{ label: "Fair & responsible", cents: s.stewardship.YES, color: GREEN }, { label: "Not sure", cents: s.stewardship.UNSURE, color: AMBER }, { label: "No", cents: s.stewardship.NO, color: RED }, { label: "Not reviewed", cents: s.stewardship.UNANSWERED, color: GREY }]} /></section>
        </div>
      )}

      <div className="flex gap-1.5 print:hidden" role="tablist" aria-label="Which expenses">
        {[[false, "All expenses"], [true, "Still to review"]].map(([v, l]) => (
          <a key={String(v)} role="tab" aria-selected={onlyTodo === v} href={`/reports?${baseQuery}&tab=review${v ? "&todo=1" : ""}`}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${onlyTodo === v ? "border-navy bg-navy text-white" : "border-[#E2E8F0] bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}>{String(l)}</a>
        ))}
      </div>
      <section className="card overflow-hidden" aria-label="Expenses to review">
        {shown.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-500">{rows.length === 0 ? "No expenses in this period." : "Everything is reviewed. Nice work."}</p> : (
          <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">{shown.map((r) => <ReviewRowView key={r.id} row={r} short={short(r.date)} />)}</ul>
        )}
        {truncated && <p className="border-t border-[#E2E8F0] px-4 py-2 text-xs text-slate-500 dark:border-slate-800">Showing the 300 largest expenses. Narrow the dates to see the rest.</p>}
      </section>
    </div>
  );
}
