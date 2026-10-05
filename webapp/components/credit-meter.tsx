import { formatCents } from "@/lib/utils/currency";
import { utilization } from "@/lib/budget/utilization";

const TONE = {
  good: { bar: "bg-emerald-600", text: "text-pos", label: "Healthy" },
  ok: { bar: "bg-lime-600", text: "text-slate-700 dark:text-slate-200", label: "Fair" },
  warn: { bar: "bg-amber-500", text: "text-warn", label: "High" },
  bad: { bar: "bg-red-600", text: "text-neg", label: "Very high" },
} as const;

/** Bar showing how much of a card's credit limit is used. Renders nothing without a limit. */
export function CreditMeter({ owedCents, limitCents, compact = false }: { owedCents: number; limitCents: number | null; compact?: boolean }) {
  const u = limitCents ? utilization(owedCents, limitCents) : null;
  if (!u) return null;
  const t = TONE[u.tone];
  const w = Math.min(100, u.pct);
  return (
    <div className="space-y-1" role="group" aria-label={`Credit used ${u.pct}% of limit`}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={`nums font-bold ${t.text}`}>{u.pct}% used</span>
        <span className="nums text-slate-500">{formatCents(u.usedCents)} of {formatCents(u.limitCents)}</span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w)}>
        <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${w}%` }} />
        <span className="absolute inset-y-0 w-px bg-white/90 dark:bg-slate-900" style={{ left: "30%" }} aria-hidden />
      </div>
      {!compact && (
        <div className="flex justify-between text-[11px] text-slate-500">
          <span>{u.over ? "Over your limit" : `${formatCents(u.availableCents)} available`}</span>
          <span>{t.label} · under 30% is best for your credit score</span>
        </div>
      )}
    </div>
  );
}
