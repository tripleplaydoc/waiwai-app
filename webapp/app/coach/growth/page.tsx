import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getScopeWorkspaceIds, getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { buildPnl } from "@/lib/reports/pnl";
import { loadHoldings } from "@/lib/reports/holdings";
import { freedomNumberCents, runwayDays, savingsRatePct, yearsToTarget } from "@/lib/coach/growth-math";
import { formatCents } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00.000Z`) + days * 86400000).toISOString().slice(0, 10);

export default async function GrowthPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";
  const today = todayIso();
  const from = shift(today, -89);
  const allIds = await getScopeWorkspaceIds();
  const [pnl, hold] = await Promise.all([
    buildPnl(ws.id, { from, to: today, prevFrom: shift(from, -90), prevTo: shift(from, -1) }),
    loadHoldings(allIds, today, "monthly", 7),
  ]);
  const nw = hold.points;
  const now = nw[nw.length - 1]?.netCents ?? 0;
  const lastMonth = nw[nw.length - 2]?.netCents ?? now;
  const sixAgo = nw[0]?.netCents ?? now;
  const avgGain = Math.round((now - sixAgo) / Math.max(1, nw.length - 1));
  const cash = hold.rows.filter((r) => r.onBudget && r.side === "ASSET").reduce((t, r) => t + Math.max(0, r.valueCents), 0);
  const invest = hold.rows.filter((r) => r.cls === "STOCKS_FUNDS").reduce((t, r) => t + Math.max(0, r.valueCents), 0);
  const rate = savingsRatePct(pnl.revenueCents, pnl.expenseCents);
  const runway = runwayDays(cash, pnl.expenseCents, 90);
  const freedom = freedomNumberCents(pnl.expenseCents, 90);
  const yrs = freedom ? yearsToTarget(invest, freedom, avgGain) : null;
  const tile = "card p-4";
  const label = "text-xs font-semibold uppercase tracking-wide text-slate-500";
  return (
    <div className="space-y-5">
      <Link href={`/coach${q}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300"><ArrowLeft className="size-4" aria-hidden /> Coach</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Growth numbers</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Four numbers that show whether your money is working for you. Spending figures use the last 90 days of {ws.name}.</p>
      </div>
      <section className="grid grid-cols-2 gap-3" aria-label="Numbers">
        <div className={tile}><p className={label}>Net worth</p><p className="nums mt-1 text-xl font-bold">{formatCents(now)}</p><p className={`nums text-xs ${now - lastMonth >= 0 ? "text-pos" : "text-neg"}`}>{now - lastMonth >= 0 ? "▲" : "▼"} {formatCents(Math.abs(now - lastMonth))} this month</p></div>
        <div className={tile}><p className={label}>Savings rate</p><p className={`nums mt-1 text-xl font-bold ${rate !== null && rate < 0 ? "text-neg" : ""}`}>{rate === null ? "—" : `${rate}%`}</p><p className="text-xs text-slate-500">of income kept</p></div>
        <div className={tile}><p className={label}>Cash runway</p><p className="nums mt-1 text-xl font-bold">{runway === null ? "—" : `${runway} days`}</p><p className="text-xs text-slate-500">at your recent spending</p></div>
        <div className={tile}><p className={label}>Freedom number</p><p className="nums mt-1 text-xl font-bold">{freedom === null ? "—" : formatCents(freedom)}</p><p className="text-xs text-slate-500">25 × a year of spending</p></div>
      </section>

      <section className="card p-5 text-sm" aria-labelledby="gn-h">
        <h2 id="gn-h" className="text-base font-bold tracking-tight">What they mean</h2>
        <dl className="mt-2 space-y-3">
          <div><dt className="font-semibold">Net worth change</dt><dd className="text-slate-600 dark:text-slate-300">Over the last {Math.max(1, nw.length - 1)} months your net worth moved by <span className="nums font-semibold">{formatCents(now - sixAgo)}</span>, an average of <span className="nums font-semibold">{formatCents(avgGain)}</span> a month. Rising steadily matters more than any single month.</dd></div>
          <div><dt className="font-semibold">Savings rate</dt><dd className="text-slate-600 dark:text-slate-300">What you kept out of what you earned. Income {formatCents(pnl.revenueCents)}, spending {formatCents(pnl.expenseCents)} in the last 90 days.</dd></div>
          <div><dt className="font-semibold">Cash runway</dt><dd className="text-slate-600 dark:text-slate-300">Cash in your on-budget accounts ({formatCents(cash)}) divided by your daily spending. It is the time you could keep paying for life with no new income. 90 days is a solid cushion; 180 or more is freedom to choose.</dd></div>
          <div><dt className="font-semibold">Freedom number</dt><dd className="text-slate-600 dark:text-slate-300">The investments that could cover a year of spending at a 4% yearly withdrawal. You hold <span className="nums font-semibold">{formatCents(invest)}</span> in stocks, funds and retirement{freedom ? ` (${Math.min(100, Math.round((invest / freedom) * 100))}% of the way)` : ""}.{yrs !== null && yrs > 0 ? ` At your average gain it would take about ${yrs} years, with no extra investment returns assumed.` : ""}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">These are rules of thumb for awareness, not financial advice.</p>
      </section>
    </div>
  );
}
