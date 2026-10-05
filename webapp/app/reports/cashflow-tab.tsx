import { buildCashflowStatement } from "@/lib/reports/cashflow-statement";
import { holdingLabel } from "@/lib/holdings";
import { formatCents } from "@/lib/utils/currency";
import { IncomeSources } from "./income-sources";

function Block({ title, children, tone }: { title: string; children: React.ReactNode; tone: string }) {
  return (
    <section className="card overflow-hidden">
      <h3 className={`${tone} px-4 py-2 text-xs font-bold uppercase tracking-wider text-white`}>{title}</h3>
      {children}
    </section>
  );
}
const Line = ({ label, cents, sub, bold }: { label: string; cents: number; sub?: string; bold?: boolean }) => (
  <li className={`flex items-baseline justify-between gap-3 px-4 py-1.5 text-sm ${bold ? "bg-navy-soft font-bold dark:bg-slate-800/50" : ""}`}>
    <span className="min-w-0 truncate">{label}{sub && <span className="ml-1.5 text-[11px] text-slate-500">{sub}</span>}</span>
    <span className="nums shrink-0">{formatCents(cents)}</span>
  </li>
);

export async function CashflowTab({ workspaceId, period, today }: { workspaceId: string; period: { from: string; to: string; prevFrom: string; prevTo: string; label: string }; today: string }) {
  const s = await buildCashflowStatement(workspaceId, period, period.to > today ? today : period.to);
  const ratio = s.freedomRatio;
  const free = ratio !== null && ratio >= 1;
  return (
    <div className="space-y-4">
      <section className={`card p-4 ${free ? "!border-pos" : ""}`} aria-label="Financial freedom">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-base font-bold tracking-tight">{free ? "Out of the rat race" : "Rat race to fast track"}</h2>
          <span className="nums ml-auto text-2xl font-bold text-water">{ratio === null ? "—" : `${Math.round(ratio * 100)}%`}</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="presentation"><div className={`h-full rounded-full ${free ? "bg-pos" : "bg-[#2E6BE6]"}`} style={{ width: `${Math.round(Math.min(1, ratio ?? 0) * 100)}%` }} /></div>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
          Portfolio + passive income of <strong className="nums">{formatCents(s.passiveCents)}</strong> covers {ratio === null ? "none of your expenses (none recorded)" : `${Math.round(ratio * 100)}% of your `}<strong className="nums">{ratio === null ? "" : formatCents(s.totalExpensesCents)}</strong>{ratio === null ? "" : " expenses"}. Reach 100% and your assets pay for your life.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Block title="Income statement" tone="bg-income">
            {s.income.map((i) => (
              <div key={i.kind}>
                <h4 className="border-y border-[#E2E8F0] bg-slate-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 first:border-t-0 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300" title={i.hint}>{i.title}</h4>
                <ul>
                  {i.lines.length === 0 && <li className="px-4 py-1.5 text-sm text-slate-400">None this period</li>}
                  {i.lines.map((l) => <Line key={l.label} {...l} />)}
                </ul>
              </div>
            ))}
            <ul className="border-t border-[#CBD5E1] dark:border-slate-700"><Line bold label="Total income" cents={s.totalIncomeCents} /></ul>
            <h4 className="border-y border-[#E2E8F0] bg-slate-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">Expenses</h4>
            <ul>
              {s.expenses.length === 0 && <li className="px-4 py-1.5 text-sm text-slate-400">None this period</li>}
              {s.expenses.map((l) => <Line key={l.label} {...l} />)}
            </ul>
            <ul className="border-t border-[#CBD5E1] dark:border-slate-700"><Line bold label="Total expenses" cents={s.totalExpensesCents} /></ul>
            <div className={`flex items-baseline justify-between px-4 py-3 text-base font-bold ${s.cashflowCents < 0 ? "bg-neg-soft text-neg" : "bg-pos-soft text-pos"}`}>
              <span>Cash flow (payday)</span><span className="nums">{formatCents(s.cashflowCents)}</span>
            </div>
          </Block>
        </div>

        <div className="min-w-0 space-y-4">
          <Block title="Assets" tone="bg-income">
            <ul>
              {s.assets.length === 0 && <li className="px-4 py-2 text-sm text-slate-400">No assets recorded</li>}
              {s.assets.map((h) => <Line key={h.id} label={h.name} sub={`${holdingLabel(h.cls)}${h.monthlyCashflowCents ? ` · earns ${formatCents(h.monthlyCashflowCents)}/mo` : ""}`} cents={h.valueCents} />)}
              <Line bold label="Total assets" cents={s.totalAssetsCents} />
            </ul>
          </Block>
          <Block title="Liabilities" tone="bg-group">
            <ul>
              {s.liabilities.length === 0 && <li className="px-4 py-2 text-sm text-slate-400">No liabilities recorded</li>}
              {s.liabilities.map((h) => <Line key={h.id} label={h.name} sub={`${holdingLabel(h.cls)}${h.monthlyCashflowCents ? ` · pays ${formatCents(h.monthlyCashflowCents)}/mo` : ""}`} cents={h.valueCents} />)}
              <Line bold label="Total liabilities" cents={s.totalLiabilitiesCents} />
            </ul>
          </Block>
          <div className="card flex items-baseline justify-between px-4 py-3 text-base font-bold"><span>Net worth</span><span className={`nums ${s.netWorthCents < 0 ? "text-neg" : "text-water"}`}>{formatCents(s.netWorthCents)}</span></div>
          {(s.expectedMonthlyAssetIncomeCents > 0 || s.scheduledMonthlyDebtPaymentsCents > 0) && (
            <p className="nums text-xs text-slate-600 dark:text-slate-300">Per month, your assets are set to earn {formatCents(s.expectedMonthlyAssetIncomeCents)} and your debts to cost {formatCents(s.scheduledMonthlyDebtPaymentsCents)}.</p>
          )}
        </div>
      </div>
      <IncomeSources workspaceId={workspaceId} today={today} />
      <p className="text-xs text-slate-500">Income and expenses are what actually happened in {period.label}. Tag each income source as earned, portfolio or passive in Income sources below. Balances are as of {period.to > today ? today : period.to}.</p>
    </div>
  );
}
