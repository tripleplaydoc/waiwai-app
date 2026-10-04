import Link from "next/link";
import { loadHoldings, type HoldingView } from "@/lib/reports/holdings";
import { HOLDING_DEFS } from "@/lib/holdings";
import { formatCents } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/dates";

const VIEWS: [HoldingView, string, number][] = [["monthly", "Monthly", 12], ["quarterly", "Quarterly", 8], ["annual", "Annual", 5]];

function Change({ cur, prev, goodWhenUp }: { cur: number; prev: number; goodWhenUp: boolean }) {
  const d = cur - prev;
  if (d === 0) return <span className="text-slate-400">—</span>;
  const big = prev !== 0 && Math.abs(d / prev) > 10;
  const pct = prev !== 0 && !big ? ` (${d > 0 ? "+" : "−"}${Math.abs(Math.round((d / Math.abs(prev)) * 1000) / 10)}%)` : "";
  return <span className={(d > 0) === goodWhenUp ? "text-pos" : "text-neg"}>{d > 0 ? "▲" : "▼"} {formatCents(Math.abs(d))}{pct}</span>;
}

/** Net worth bars over time. */
function NetWorthBars({ points }: { points: { label: string; netCents: number }[] }) {
  const max = Math.max(1, ...points.map((p) => Math.abs(p.netCents)));
  const W = 320, H = 120, bw = W / points.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label="Net worth over time">
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="stroke-slate-200 dark:stroke-slate-700" />
      {points.map((p, i) => {
        const h = (Math.abs(p.netCents) / max) * (H / 2 - 4);
        const y = p.netCents >= 0 ? H / 2 - h : H / 2;
        return (
          <g key={p.label + i}>
            <rect x={i * bw + bw * 0.18} y={y} width={bw * 0.64} height={Math.max(1, h)} rx="2" className={p.netCents >= 0 ? "fill-[#059669]" : "fill-[#DC2626]"} opacity={i === points.length - 1 ? 1 : 0.65}><title>{`${p.label}: ${formatCents(p.netCents)}`}</title></rect>
            <text x={i * bw + bw / 2} y={H + 12} textAnchor="middle" fontSize="8.5" className="fill-slate-500">{p.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export async function AssetsTab({ workspaceIds, view, scopeAll, baseQuery }: { workspaceIds: string[]; view: string; scopeAll: boolean; baseQuery: string }) {
  const v = VIEWS.find(([k]) => k === view) ?? VIEWS[0];
  const { points } = await loadHoldings(workspaceIds, todayIso(), v[0], v[2]);
  const now = points[points.length - 1], prev = points[points.length - 2] ?? now;
  const first = points[0];
  const unit = v[0] === "monthly" ? "last month" : v[0] === "quarterly" ? "last quarter" : "last year";
  const link = (extra: string) => `/reports?${baseQuery}&tab=assets${extra}`;
  const rows = HOLDING_DEFS.map((d) => ({ d, cur: now.byClass[d.key] ?? 0, prev: prev.byClass[d.key] ?? 0, first: first.byClass[d.key] ?? 0 })).filter((r) => r.cur !== 0 || r.prev !== 0 || r.first !== 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex gap-1.5" role="tablist" aria-label="Time view">
          {VIEWS.map(([k, l]) => (
            <Link key={k} role="tab" aria-selected={v[0] === k} href={link(`&view=${k}${scopeAll ? "&scope=all" : ""}`)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${v[0] === k ? "border-navy bg-navy text-white" : "border-[#E2E8F0] bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}>{l}</Link>
          ))}
        </div>
        <Link href={link(`&view=${v[0]}${scopeAll ? "" : "&scope=all"}`)} className="btn btn-sm ml-auto">{scopeAll ? "Showing Personal + Business" : "Show Personal + Business"}</Link>
      </div>

      <section className="card grid grid-cols-3 divide-x divide-[#E2E8F0] text-center dark:divide-slate-800" aria-label="Net worth">
        <div className="px-2 py-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Assets</div><div className="nums text-base font-bold text-pos sm:text-xl">{formatCents(now.assetsCents)}</div><div className="nums text-[11px]"><Change cur={now.assetsCents} prev={prev.assetsCents} goodWhenUp /></div></div>
        <div className="px-2 py-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Liabilities</div><div className="nums text-base font-bold text-neg sm:text-xl">{formatCents(now.liabilitiesCents)}</div><div className="nums text-[11px]"><Change cur={now.liabilitiesCents} prev={prev.liabilitiesCents} goodWhenUp={false} /></div></div>
        <div className="px-2 py-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Net worth</div><div className={`nums text-base font-bold sm:text-xl ${now.netCents < 0 ? "text-neg" : "text-water"}`}>{formatCents(now.netCents)}</div><div className="nums text-[11px]"><Change cur={now.netCents} prev={prev.netCents} goodWhenUp /></div></div>
      </section>
      <p className="-mt-2 text-xs text-slate-500">Changes compare with {unit} ({prev.label}).</p>

      <section className="card p-4" aria-label="Net worth over time">
        <h2 className="mb-2 text-base font-bold tracking-tight">Net worth over time</h2>
        <NetWorthBars points={points} />
      </section>

      <section className="card overflow-hidden" aria-label="Assets and liabilities by type">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-[#E2E8F0] bg-navy-soft dark:border-slate-800 dark:bg-slate-800/50">
            <tr><th className="th">Type</th><th className="th text-right">Now</th><th className="th text-right">Change vs {unit}</th><th className="th hidden text-right sm:table-cell">Since {first.label}</th></tr>
          </thead>
          {(["ASSET", "LIABILITY"] as const).map((side) => {
            const list = rows.filter((r) => r.d.side === side);
            return (
              <tbody key={side}>
                <tr className={side === "ASSET" ? "bg-income" : "bg-group"}><th colSpan={4} scope="colgroup" className="px-4 py-1.5 text-left text-xs font-bold uppercase tracking-wider text-white">{side === "ASSET" ? "Assets" : "Liabilities"}</th></tr>
                {list.length === 0 && <tr><td colSpan={4} className="td text-slate-500">None yet — add them on the <Link className="underline" href="/holdings">Assets &amp; liabilities</Link> page.</td></tr>}
                {list.map((r) => (
                  <tr key={r.d.key} className="border-b border-[#E2E8F0] dark:border-slate-800">
                    <td className="td font-medium">{r.d.label}</td>
                    <td className="td nums text-right font-semibold">{formatCents(r.cur)}</td>
                    <td className="td nums text-right text-xs"><Change cur={r.cur} prev={r.prev} goodWhenUp={side === "ASSET"} /></td>
                    <td className="td nums hidden text-right text-xs sm:table-cell"><Change cur={r.cur} prev={r.first} goodWhenUp={side === "ASSET"} /></td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </section>
    </div>
  );
}
