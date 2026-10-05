import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { loadHoldings } from "@/lib/reports/holdings";
import { HOLDING_DEFS, holdingLabel, type HoldingKey } from "@/lib/holdings";
import { formatCents } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/dates";
import { HoldingButton } from "./holding-dialog";

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
                  <div className="truncate text-sm font-semibold">{r.manual ? r.name : <Link href={`/accounts/${r.id}${wsQ}`} className="text-[#2E6BE6] hover:underline dark:text-indigo-300">{r.name}</Link>}</div>
                  <div className="text-xs text-slate-500">
                    {r.monthlyCashflowCents > 0 && <>{side === "ASSET" ? "Earns" : "Pays"} {formatCents(r.monthlyCashflowCents)}/mo</>}
                    {r.monthlyCashflowCents > 0 && delta !== 0 && " · "}
                    {delta !== 0 && <span className={better ? "text-pos" : "text-neg"}>{delta > 0 ? "▲" : "▼"} {formatCents(Math.abs(delta))} since last month</span>}
                  </div>
                </div>
                <div className="nums shrink-0 text-right text-[15px] font-bold">{formatCents(r.valueCents)}</div>
                <HoldingButton workspaceId={ws.id} today={today} moveTo={{ id: other.id, name: other.name }} edit={{ id: r.id, name: r.name, cls: r.cls, valueCents: r.valueCents, monthlyCents: r.monthlyCashflowCents, manual: r.manual }} />
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
        <div className="ml-auto"><HoldingButton workspaceId={ws.id} today={today} /></div>
      </div>
      <div className="flex gap-2 text-sm font-semibold" role="tablist" aria-label="Accounts view">
        <Link role="tab" aria-selected={false} href={`/accounts${wsQ}`} className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Accounts</Link>
        <span role="tab" aria-selected className="rounded-full bg-navy px-4 py-2 text-white">Assets &amp; liabilities</span>
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

      <section className="card overflow-hidden" aria-label="Assets">
        <h2 className="bg-income px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">Assets</h2>
        {list("ASSET")}
      </section>
      <section className="card overflow-hidden" aria-label="Liabilities">
        <h2 className="bg-group px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">Liabilities</h2>
        {list("LIABILITY")}
      </section>
    </div>
  );
}
