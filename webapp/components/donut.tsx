import { formatCents } from "@/lib/utils/currency";

export interface DonutSlice { key: string; label: string; cents: number; color?: string; children?: { label: string; cents: number }[] }
const PALETTE = ["#4F46E5", "#059669", "#D97706", "#2563EB", "#DC2626", "#7C3AED", "#0891B2", "#DB2777", "#65A30D", "#64748B", "#EA580C", "#0D9488"];

/** Ring chart + legend. Pure SVG, server-rendered, no client JS. */
export function Donut({ slices, centerLabel, centerValue }: { slices: DonutSlice[]; centerLabel: string; centerValue: string }) {
  const total = slices.reduce((s, x) => s + x.cents, 0);
  if (total <= 0) return <p className="py-6 text-center text-sm text-slate-500">Nothing to show for this period.</p>;
  const R = 70, C = 2 * Math.PI * R, GAP = slices.length > 1 ? 1.5 : 0;
  let offset = 0;
  const colored = slices.map((s, i) => ({ ...s, color: s.color ?? PALETTE[i % PALETTE.length] }));
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[14rem_1fr]">
      <div className="relative mx-auto w-full max-w-[14rem]">
        <svg viewBox="0 0 200 200" role="img" aria-label={`Breakdown of ${centerValue}`} className="w-full -rotate-90">
          <circle cx="100" cy="100" r={R} fill="none" strokeWidth="26" className="stroke-slate-100 dark:stroke-slate-800" />
          {colored.map((s) => {
            const len = (s.cents / total) * C;
            const el = <circle key={s.key} cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth="26" strokeDasharray={`${Math.max(0, len - GAP)} ${C - Math.max(0, len - GAP)}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{centerLabel}</span>
          <span className="nums text-lg font-bold">{centerValue}</span>
        </div>
      </div>
      <ul className="space-y-1">
        {colored.map((s) => (
          <li key={s.key}>
            <details className="group">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-sm">
                <i className="size-3 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
                <span className="nums text-xs text-slate-500">{Math.round((s.cents / total) * 100)}%</span>
                <span className="nums w-24 text-right font-semibold">{formatCents(s.cents)}</span>
              </summary>
              {s.children && s.children.length > 0 && (
                <ul className="mb-1 ml-5 space-y-0.5 border-l border-[#E2E8F0] pl-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {s.children.map((c) => <li key={c.label} className="flex justify-between gap-3"><span className="truncate">{c.label}</span><span className="nums">{formatCents(c.cents)}</span></li>)}
                </ul>
              )}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
