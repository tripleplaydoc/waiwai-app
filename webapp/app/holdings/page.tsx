import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { loadHoldings } from "@/lib/reports/holdings";
import { HOLDING_DEFS, holdingLabel, type HoldingKey } from "@/lib/holdings";
import { formatCents } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/dates";
import { loadHoldingMeta } from "@/lib/reports/holding-meta";
import { amortize, monthYearLabel } from "@/lib/loans";
import { PriceRefresher } from "@/components/price-refresher";
import { HoldingButton } from "./holding-dialog";

const CLASS_COLOR: Record<string, string> = {
  CASH_SAVINGS: "#0E7C86", STOCKS_FUNDS: "#2E6BE6", REAL_ESTATE: "#059669", BUSINESS: "#7C3AED", VEHICLE: "#D97706",
  CRYPTO: "#F59E0B", COLLECTIBLES: "#DB2777", OTHER_ASSET: "#64748B",
};
const dayDiff = (a: string, b: string) => Math.round((Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 86_400_000);

export const dynamic = "force-dynamic";

export default async function HoldingsPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const ws = await getWorkspace(wsKey);
  const other = await getWorkspace(wsKey === "business" ? "personal" : "business");
  const today = todayIso();
  const { points, rows, prevById } = await loadHoldings([ws.id], today, "monthly", 2);
  const now = points[points.length - 1], before = points[0];
  const wsQ = wsKey === "business" ? "?ws=business" : "";
  const growth = now.netCents - before.netCents;
  const sections = (side: "ASSET" | "LIABILITY") =>
    HOLDING_DEFS.filter((d) => d.side === side).map((d) => ({ def: d, items: rows.filter((r) => r.cls === d.key) })).filter((s) => s.items.length > 0);
  const monthlyIncome = rows.filter((r) => r.side === "ASSET").reduce((s, r) => s + r.monthlyCashflowCents, 0);
  const monthlyPayments = rows.filter((r) => r.side === "LIABILITY").reduce((s, r) => s + r.monthlyCashflowCents, 0);
  const meta = await loadHoldingMeta(rows.map((r) => r.id));
  const hasPositions = [...meta.values()].some((m) => m.positions.length > 0);
  const hasDebt = rows.some((r) => r.side === "LIABILITY" && r.valueCents > 0);
  const owedById = new Map(rows.map((r) => [r.id, r.valueCents]));
  const alloc = HOLDING_DEFS.filter((d) => d.side === "ASSET").map((d) => ({ key: d.key, label: d.label.replace(/ \(.*\)$/, ""), cents: Math.max(0, now.byClass[d.key] ?? 0) })).filter((a) => a.cents > 0);
  const allocTotal = alloc.reduce((s, a) => s + a.cents, 0);

  /** One short line of facts per holding (rate and payoff date, coins held, equity, a nudge when a value is old…). */
  const facts = (r: (typeof rows)[number]): React.ReactNode[] => {
    const m = meta.get(r.id);
    const out: React.ReactNode[] = [];
    if (!m) return out;
    if (m.positions.length > 0) out.push(`${m.positions.length} ${r.cls === "CRYPTO" ? (m.positions.length === 1 ? "coin" : "coins") : m.positions.length === 1 ? "holding" : "holdings"} · live prices`);
    else if ((r.cls === "CRYPTO" || r.cls === "STOCKS_FUNDS") && r.manual) out.push(<span key="add" className="text-amber-600">Tap to add {r.cls === "CRYPTO" ? "coins" : "shares"}</span>);
    if (r.cls === "VEHICLE") {
      const name = [m.year, m.make, m.model].filter(Boolean).join(" ");
      if (name) out.push(name);
      const age = m.valuedOn ? dayDiff(today, m.valuedOn) : null;
      if (age !== null && age > 90) out.push(<span key="stale" className="text-amber-600">value is {age} days old</span>);
    }
    if (r.side === "LIABILITY" && m.aprBps != null) {
      const res = amortize({ balanceCents: r.valueCents, aprBps: m.aprBps, paymentCents: r.monthlyCashflowCents });
      out.push(`${m.aprBps / 100}%`);
      if (r.valueCents > 0) out.push(res.never ? <span key="never" className="text-neg">payment doesn’t cover interest</span> : `paid off ${monthYearLabel(today, res.months)}`);
    }
    if (r.side === "ASSET" && m.linkedLoanId && owedById.has(m.linkedLoanId)) out.push(`equity ${formatCents(r.valueCents - owedById.get(m.linkedLoanId)!)}`);
    return out;
  };

  const list = (side: "ASSET" | "LIABILITY") => {
    const secs = sections(side);
    if (secs.length === 0) return <p className="px-4 py-4 text-sm text-slate-500">{side === "ASSET" ? "No assets yet. Add your home, investments, business, vehicles…" : "No liabilities yet. Add your mortgage, loans, credit cards…"}</p>;
    return secs.map(({ def, items }) => (
      <div key={def.key}>
        <h3 className="flex justify-between border-b border-[#E2E8F0] bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
          <span>{holdingLabel(def.key as HoldingKey)}</span>
          <span className="nums">{formatCents(items.reduce((s, r) => s + r.valueCents, 0))}</span>
        </h3>
        <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
          {items.map((r) => {
            const prev = prevById.get(r.id) ?? 0;
            const delta = r.valueCents - prev;
            const better = side === "ASSET" ? delta > 0 : delta < 0;
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold"><Link href={r.manual ? `/holdings/${r.id}${wsQ}` : `/accounts/${r.id}${wsQ}`} className="text-[#2E6BE6] hover:underline dark:text-indigo-300">{r.name}</Link></div>
                  <div className="nums truncate text-xs text-slate-500">
                    {[
                      ...facts(r),
                      ...(r.monthlyCashflowCents > 0 ? [`${side === "ASSET" ? "Earns" : "Pays"} ${formatCents(r.monthlyCashflowCents)}/mo`] : []),
                    ].flatMap((x, i) => (i === 0 ? [x] : [" · ", x]))}
                  </div>
                </div>
                <div className="shrink-0 text-right"><div className="nums text-[15px] font-bold">{formatCents(r.valueCents)}</div>{delta !== 0 && <div className={`nums text-[11px] ${better ? "text-pos" : "text-neg"}`}>{delta > 0 ? "▲" : "▼"} {formatCents(Math.abs(delta))}</div>}</div>
                <HoldingButton workspaceId={ws.id} today={today} moveTo={{ id: other.id, name: other.name }} edit={{ id: r.id, name: r.name, cls: r.cls, valueCents: r.valueCents, monthlyCents: r.monthlyCashflowCents, manual: r.manual, hasPositions: (meta.get(r.id)?.positions.length ?? 0) > 0 }} />
              </li>
            );
          })}
        </ul>
      </div>
    ));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{ws.name} assets &amp; liabilities</h1>
        <div className="ml-auto flex items-center gap-2">{hasPositions && <PriceRefresher workspaceId={ws.id} compact />}<HoldingButton workspaceId={ws.id} today={today} /></div>
      </div>
      <div className="flex flex-wrap gap-2 text-sm font-semibold" role="tablist" aria-label="Accounts view">
        <Link role="tab" aria-selected={false} href={`/accounts${wsQ}`} className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Accounts</Link>
        <span role="tab" aria-selected className="rounded-full bg-navy px-4 py-2 text-white">Assets &amp; liabilities</span>
        <Link role="tab" aria-selected={false} href={`/recurring${wsQ}`} className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Recurring</Link>
        <Link role="tab" aria-selected={false} href={`/forecast${wsQ}`} className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Forecast</Link>
      </div>

      <section className="card grid grid-cols-3 divide-x divide-[#E2E8F0] text-center dark:divide-slate-800" aria-label="Net worth">
        <div className="px-2 py-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Assets</div><div className="nums text-base font-bold text-pos sm:text-xl">{formatCents(now.assetsCents)}</div></div>
        <div className="px-2 py-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Liabilities</div><div className="nums text-base font-bold text-neg sm:text-xl">{formatCents(now.liabilitiesCents)}</div></div>
        <div className="px-2 py-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Net worth</div><div className={`nums text-base font-bold sm:text-xl ${now.netCents < 0 ? "text-neg" : "text-water"}`}>{formatCents(now.netCents)}</div>
          <div className={`nums text-[11px] ${growth >= 0 ? "text-pos" : "text-neg"}`}>{growth >= 0 ? "▲" : "▼"} {formatCents(Math.abs(growth))} vs last month</div></div>
      </section>
      {(monthlyIncome > 0 || monthlyPayments > 0) && (
        <p className="nums text-xs text-slate-600 dark:text-slate-300">Your assets earn <strong className="text-pos">{formatCents(monthlyIncome)}</strong>/mo and your debts cost <strong className="text-neg">{formatCents(monthlyPayments)}</strong>/mo. See the Cash flow report for the full picture.</p>
      )}

      {allocTotal > 0 && alloc.length > 1 && (
        <section className="card p-4" aria-label="Where your assets are">
          <div className="mb-2 flex h-3 overflow-hidden rounded-full" role="img" aria-label={alloc.map((a) => `${a.label} ${Math.round((a.cents / allocTotal) * 100)}%`).join(", ")}>
            {alloc.map((a) => <div key={a.key} style={{ width: `${(a.cents / allocTotal) * 100}%`, background: CLASS_COLOR[a.key] }} />)}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            {alloc.map((a) => <li key={a.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: CLASS_COLOR[a.key] }} aria-hidden />{a.label} <span className="nums font-semibold">{Math.round((a.cents / allocTotal) * 100)}%</span></li>)}
          </ul>
        </section>
      )}

      <section className="card overflow-hidden" aria-label="Assets">
        <h2 className="bg-income px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">Assets</h2>
        {list("ASSET")}
      </section>
      <section className="card overflow-hidden" aria-label="Liabilities">
        <h2 className="flex items-center justify-between bg-group px-4 py-2 text-xs font-bold uppercase tracking-wider text-white"><span>Liabilities</span>{hasDebt && <Link href={`/holdings/payoff${wsQ}`} className="rounded-full bg-white/15 px-3 py-1 text-[11px] normal-case tracking-normal hover:bg-white/25">Debt payoff plan →</Link>}</h2>
        {list("LIABILITY")}
      </section>
    </div>
  );
}
