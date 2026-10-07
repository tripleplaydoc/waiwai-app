import { Download, TrendingDown, TrendingUp } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { buildPnl, byPerson, taxRateBps, type PnlTypeRow } from "@/lib/reports/pnl";
import { PRESETS, resolvePeriod } from "@/lib/reports/periods";
import { formatCents } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/dates";
import { PrintButton } from "./print-button";
import { ExportForm } from "./export-form";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Hourglass } from "lucide-react";
import { getScopeWorkspaceIds } from "@/lib/workspace";
import { getBudgetSummary } from "@/lib/budget/summary";
import { healthFromSummary } from "@/lib/budget/health-from-summary";
import { startOfMonthUTC } from "@/lib/budget/dates";
import { describeMonths } from "@/lib/budget/targets";
import { ExpensesTab } from "./expenses-tab";
import { AssetsTab } from "./assets-tab";
import { CashflowTab } from "./cashflow-tab";
import { ReviewTab } from "./review-tab";
import { MissedPanel } from "./missed-panel";
import { missedDeductions } from "@/lib/reports/missed";

export const dynamic = "force-dynamic";
type SP = Promise<{ ws?: string; period?: string; from?: string; to?: string; tab?: string; by?: string; view?: string; scope?: string; todo?: string }>;
const TABS = [["pnl", "Overview"], ["expenses", "Expenses"], ["assets", "Assets"], ["cashflow", "Cash flow"], ["review", "Review"]] as const;

function Delta({ cur, prev, goodWhenUp }: { cur: number; prev: number; goodWhenUp: boolean }) {
  if (prev === 0 && cur === 0) return <span className="text-slate-400">—</span>;
  if (prev === 0) return <span className="text-slate-400">new</span>;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (pct === 0) return <span className="text-slate-400">0%</span>;
  const good = (pct > 0) === goodWhenUp;
  return <span className={good ? "text-pos" : "text-neg"}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

function Section({ title, rows, total, prevTotal, goodWhenUp, tone }: { title: string; rows: PnlTypeRow[]; total: number; prevTotal: number; goodWhenUp: boolean; tone: string }) {
  return (
    <tbody>
      <tr className={tone}>
        <th scope="colgroup" colSpan={4} className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-white">{title}</th>
      </tr>
      {rows.length === 0 && <tr><td colSpan={4} className="td text-slate-500">Nothing recorded in this period.</td></tr>}
      {rows.map((r) => (
        <tr key={r.key} className="border-b border-[#E2E8F0] align-top dark:border-slate-800">
          <td className="td" colSpan={1}>
            <details>
              <summary className="cursor-pointer select-none font-medium">{r.label}</summary>
              <ul className="mt-1 space-y-0.5 pl-1 text-xs text-slate-500">
                {r.pockets.map((p) => (
                  <li key={p.id} className="flex justify-between gap-4"><span>{p.name}{p.deductible && <span className="ml-1 text-[10px] text-water">deductible</span>}</span><span className="nums">{formatCents(p.cents)}</span></li>
                ))}
              </ul>
            </details>
          </td>
          <td className="td nums text-right font-medium">{formatCents(r.cents)}</td>
          <td className="td nums hidden text-right text-slate-500 sm:table-cell">{formatCents(r.prevCents)}</td>
          <td className="td nums hidden text-right text-xs sm:table-cell"><Delta cur={r.cents} prev={r.prevCents} goodWhenUp={goodWhenUp} /></td>
        </tr>
      ))}
      <tr className="border-b-2 border-[#CBD5E1] bg-navy-soft font-bold dark:border-slate-700 dark:bg-slate-800/50">
        <td className="td">Total {title.toLowerCase()}</td>
        <td className="td nums text-right">{formatCents(total)}</td>
        <td className="td nums hidden text-right text-slate-500 sm:table-cell">{formatCents(prevTotal)}</td>
        <td className="td nums hidden text-right text-xs sm:table-cell"><Delta cur={total} prev={prevTotal} goodWhenUp={goodWhenUp} /></td>
      </tr>
    </tbody>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: SP }) {
  await requireAuth();
  const sp = await searchParams;
  const wsKey = wsKeyFromParam(sp.ws);
  const ws = await getWorkspace(wsKey);
  const period = resolvePeriod(sp.period, sp.from, sp.to, todayIso());
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as (typeof TABS)[number][0]) : "pnl";
  const today = todayIso();
  const baseQuery = new URLSearchParams({ period: period.preset, from: period.from, to: period.to, ...(wsKey === "business" ? { ws: "business" } : {}) }).toString();
  const health = tab === "pnl" || tab === "assets" ? healthFromSummary(await getBudgetSummary(ws.id, startOfMonthUTC(new Date())), startOfMonthUTC(new Date())) : null;
  const scopeAll = sp.scope === "all";
  const wsIds = scopeAll ? await getScopeWorkspaceIds() : [ws.id];
  const [r, bps, people, accounts] = await Promise.all([
    buildPnl(ws.id, period), taxRateBps(ws.id), byPerson(ws.id, period.from, period.to),
    prisma.account.findMany({ where: { workspaceId: ws.id, isArchived: false }, orderBy: [{ onBudget: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const isBiz = ws.type === "BUSINESS";
  const missed = isBiz && tab === "pnl" ? await missedDeductions(ws.id, period.from, period.to, bps) : [];
  const margin = r.revenueCents > 0 ? Math.round((r.netCents / r.revenueCents) * 1000) / 10 : null;
  const taxableCents = Math.max(0, r.revenueCents - r.deductibleCents);
  const estTaxCents = Math.round((taxableCents * bps) / 10_000);
  const exportQ = new URLSearchParams({ period: period.preset, from: period.from, to: period.to, ...(wsKey === "business" ? { ws: "business" } : {}) });
  const maxBar = Math.max(r.revenueCents, r.expenseCents, 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{ws.name} {tab === "pnl" ? "profit & loss" : "reports"}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">{tab === "assets" ? "Balances over time" : period.label}</p>
        </div>
        <div className="ml-auto flex gap-2 print:hidden">
          <Link href={`/history${wsKey === "business" ? "?ws=business" : ""}`} className="btn btn-sm">History</Link>
          <a href={`/reports/export?${exportQ}&kind=pnl`} className="btn btn-sm"><Download className="size-4" aria-hidden /> CSV</a>
          <PrintButton />
        </div>
      </div>

      <nav className="grid grid-cols-5 gap-1 print:hidden" role="tablist" aria-label="Report">
        {TABS.map(([k, l]) => (
          <Link key={k} role="tab" aria-selected={tab === k} href={`/reports?${baseQuery}&tab=${k}`}
            className={`rounded-full border px-1 py-2.5 text-center text-xs font-semibold sm:text-sm ${tab === k ? "border-navy bg-navy text-white" : "border-[#E2E8F0] bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}>{l}</Link>
        ))}
      </nav>

      {tab !== "assets" && <form method="get" className="card grid grid-cols-2 items-end gap-3 p-4 sm:flex sm:flex-wrap print:hidden" aria-label="Report period">
        {wsKey === "business" && <input type="hidden" name="ws" value="business" />}
        <input type="hidden" name="tab" value={tab} />
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="rp-period" className="label">Period</label>
          <select id="rp-period" name="period" defaultValue={period.preset} className="input sm:min-w-44">
            {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rp-from" className="label">From (custom)</label>
          <input id="rp-from" type="date" name="from" defaultValue={period.from} className="input" />
        </div>
        <div>
          <label htmlFor="rp-to" className="label">To (custom)</label>
          <input id="rp-to" type="date" name="to" defaultValue={period.to} className="input" />
        </div>
        <button type="submit" className="btn btn-primary col-span-2 sm:col-span-1">Update</button>
      </form>}

      {health && (
        <section className="card flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3" aria-label="Age of money">
          <Hourglass className="size-5 text-[#2E6BE6]" aria-hidden />
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Age of money</span>
            {health.monthsAhead === null ? (
              <span className="text-sm text-slate-600 dark:text-slate-300">Set monthly costs on your pockets to see how long your money lasts.</span>
            ) : (
              <span className="nums text-xl font-bold text-[#2E6BE6] dark:text-blue-300">{Math.round(health.monthsAhead * 30)} days <span className="text-sm font-medium text-slate-500">· {describeMonths(health.monthsAhead)}</span></span>
            )}
          </div>
          {health.monthsAhead !== null && health.monthsAheadWithRta !== null && (
            <p className="text-xs text-slate-600 dark:text-slate-300 sm:ml-auto sm:max-w-xs sm:text-right">How long the money in your pockets would cover your monthly costs ({formatCents(health.pocketMoneyCents)} vs {formatCents(health.monthlyCostCents)}/mo). With Money in pool: {describeMonths(health.monthsAheadWithRta)}.</p>
          )}
        </section>
      )}

      {tab === "expenses" && <ExpensesTab workspaceId={ws.id} from={period.from} to={period.to} by={sp.by ?? "category"} baseQuery={baseQuery} />}
      {tab === "assets" && <AssetsTab workspaceIds={wsIds} view={sp.view ?? "monthly"} scopeAll={scopeAll} baseQuery={baseQuery} />}
      {tab === "cashflow" && <CashflowTab workspaceId={ws.id} period={period} today={today} />}
      {tab === "review" && <ReviewTab workspaceId={ws.id} from={period.from} to={period.to} label={period.label} onlyTodo={sp.todo === "1"} baseQuery={baseQuery} />}

      {tab === "pnl" && (<>

      <div className="grid gap-4 sm:grid-cols-3">
        <section className="card p-5" aria-label="Revenue">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><TrendingUp className="size-4 text-income" aria-hidden /> Revenue</div>
          <div className="nums mt-1 text-3xl font-bold tracking-tight text-income dark:text-pos">{formatCents(r.revenueCents)}</div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-income" style={{ width: `${(r.revenueCents / maxBar) * 100}%` }} /></div>
        </section>
        <section className="card p-5" aria-label="Expenses">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><TrendingDown className="size-4 text-neg" aria-hidden /> Expenses</div>
          <div className="nums mt-1 text-3xl font-bold tracking-tight">{formatCents(r.expenseCents)}</div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-neg" style={{ width: `${(r.expenseCents / maxBar) * 100}%` }} /></div>
        </section>
        <section className={`card p-5 ${r.netCents < 0 ? "!border-red-300" : ""}`} aria-label="Net income">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Net income</div>
          <div className={`nums mt-1 text-3xl font-bold tracking-tight ${r.netCents < 0 ? "text-neg" : "text-water"}`}>{formatCents(r.netCents)}</div>
          <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">{margin === null ? "No revenue in this period." : `${margin}% of revenue kept.`}</p>
        </section>
      </div>

      {r.uncategorizedCount > 0 && (
        <p className="rounded-xl border border-amber-300 bg-warn-soft px-4 py-2.5 text-sm text-warn dark:border-amber-700">
          {r.uncategorizedCount} transaction{r.uncategorizedCount === 1 ? "" : "s"} ({formatCents(Math.abs(r.uncategorizedCents))}) in this period {r.uncategorizedCount === 1 ? "has" : "have"} no pocket yet, so {r.uncategorizedCount === 1 ? "it isn't" : "they aren't"} counted below.
        </p>
      )}

      <section className="card overflow-hidden" aria-label="Profit and loss statement">
        <table className="w-full border-collapse">
          <thead className="border-b border-[#E2E8F0] bg-navy-soft dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="th">Type</th><th className="th text-right">This period</th>
              <th className="th hidden text-right sm:table-cell">Previous</th><th className="th hidden text-right sm:table-cell">Change</th>
            </tr>
          </thead>
          <Section title="Revenue" rows={r.revenue} total={r.revenueCents} prevTotal={r.prevRevenueCents} goodWhenUp tone="bg-income" />
          <Section title="Expenses" rows={r.expenses} total={r.expenseCents} prevTotal={r.prevExpenseCents} goodWhenUp={false} tone="bg-group" />
          <tfoot>
            <tr className="bg-water/10 text-base font-bold">
              <td className="td">Net income</td>
              <td className={`td nums text-right ${r.netCents < 0 ? "text-neg" : "text-income dark:text-pos"}`}>{formatCents(r.netCents)}</td>
              <td className="td nums hidden text-right text-slate-500 sm:table-cell">{formatCents(r.prevNetCents)}</td>
              <td className="td nums hidden text-right text-xs sm:table-cell"><Delta cur={r.netCents} prev={r.prevNetCents} goodWhenUp /></td>
            </tr>
          </tfoot>
        </table>
      </section>

      {people.length > 1 && (
        <section className="card p-5" aria-label="By person">
          <h2 className="text-base font-bold tracking-tight">By person</h2>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-1.5 font-semibold">Who</th><th className="py-1.5 text-right font-semibold">Spent</th><th className="py-1.5 text-right font-semibold">Received</th></tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id ?? "none"} className="border-t border-[#E2E8F0] dark:border-slate-800">
                  <td className="py-2 font-medium">{p.name}</td>
                  <td className="nums py-2 text-right">{formatCents(p.spentCents)}</td>
                  <td className="nums py-2 text-right text-pos">{formatCents(p.receivedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {isBiz && (
        <section className="card p-5" aria-label="Tax estimate">
          <h2 className="text-base font-bold tracking-tight">Tax set-aside estimate</h2>
          <dl className="nums mt-3 grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-slate-500">Revenue</dt><dd className="text-right">{formatCents(r.revenueCents)}</dd>
            <dt className="text-slate-500">Tax-deductible expenses</dt><dd className="text-right">− {formatCents(r.deductibleCents)}</dd>
            <dt className="font-medium">Net taxable income</dt><dd className="text-right font-medium">{formatCents(taxableCents)}</dd>
            <dt className="text-slate-500">Reserve at {bps / 100}%</dt><dd className="text-right font-semibold text-warn">{formatCents(estTaxCents)}</dd>
            <dt className="text-slate-500">Estimated tax already paid</dt><dd className="text-right">{formatCents(r.taxPaymentsCents)}</dd>
          </dl>
          <p className="mt-3 text-xs text-slate-500">An estimate for planning, not tax advice. Mark pockets tax-deductible on the budget page to include them.</p>
        </section>
      )}

      {isBiz && <MissedPanel items={missed} workspaceId={ws.id} reviewHref={`/reports?${baseQuery}&tab=review`} />}

      <section className="card p-5 print:hidden" aria-labelledby="ex-h">
        <h2 id="ex-h" className="text-base font-bold tracking-tight">Export for QuickBooks &amp; taxes</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Uses the period above ({period.label}). Files are CSV, which QuickBooks, Excel and most tax software accept.</p>
        <ExportForm accounts={accounts} wsKey={wsKey} from={period.from} to={period.to} />
        <ul className="mt-4 space-y-1 text-xs text-slate-500 dark:text-slate-400">
          <li><strong>QuickBooks:</strong> Banking → Upload transactions → choose the file for that account; the columns Date, Description and Amount map automatically. Then categorize inside QuickBooks.</li>
          <li><strong>Schedule C:</strong> totals by IRS line for your preparer or tax software. It&apos;s a planning aid; confirm meals, equipment and home-office items with a tax professional.</li>
        </ul>
      </section>
      </>)}
    </div>
  );
}
