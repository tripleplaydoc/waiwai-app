import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { buildPnl } from "@/lib/reports/pnl";
import { flowSlices } from "@/lib/coach/flow-math";
import { formatCents } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";
const COLORS = ["#4F46E5", "#2563EB", "#0891B2", "#7C3AED", "#DB2777", "#EA580C", "#CA8A04", "#64748B"];
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00.000Z`) + days * 86400000).toISOString().slice(0, 10);

export default async function FlowPage({ searchParams }: { searchParams: Promise<{ ws?: string; range?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const wsKey = wsKeyFromParam(sp.ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";
  const range = sp.range === "365" ? 365 : sp.range === "30" ? 30 : 90;
  const today = todayIso();
  const from = shift(today, -(range - 1));
  const pnl = await buildPnl(ws.id, { from, to: today, prevFrom: shift(from, -range), prevTo: shift(from, -1) });
  const slices = flowSlices(pnl.revenueCents, pnl.expenses.map((e) => ({ label: e.label, cents: e.cents })), pnl.taxPaymentsCents);
  const colorFor = (i: number, kind: string) => (kind === "left" ? "#059669" : kind === "over" ? "#DC2626" : kind === "tax" ? "#D97706" : COLORS[i % COLORS.length]);
  const link = (r: number) => `/coach/flow?${new URLSearchParams({ ...(wsKey === "business" ? { ws: "business" } : {}), range: String(r) })}`;
  return (
    <div className="space-y-5">
      <Link href={`/coach${q}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300"><ArrowLeft className="size-4" aria-hidden /> Coach</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Where every $100 went</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Money in, and the path it took out. Seeing the shape of your money is the first step to directing it.</p>
      </div>
      <nav className="flex gap-2" aria-label="Range">
        {[30, 90, 365].map((r) => <Link key={r} href={link(r)} aria-current={range === r ? "page" : undefined} className={`flex min-h-11 flex-1 items-center justify-center rounded-full border text-sm font-semibold ${range === r ? "border-navy bg-navy text-white" : "border-[#E2E8F0] bg-white dark:border-slate-700 dark:bg-slate-900"}`}>{r === 365 ? "1 year" : `${r} days`}</Link>)}
      </nav>
      {slices.length === 0 ? (
        <div className="card p-5 text-sm">No income recorded in the last {range} days, so there is nothing to divide yet. Record income in an income pocket and this fills in.</div>
      ) : (
        <>
          <section className="card p-5" aria-labelledby="fl-h">
            <h2 id="fl-h" className="text-base font-bold tracking-tight">Of <span className="nums">{formatCents(pnl.revenueCents)}</span> that came in</h2>
            <div className="mt-3 flex h-8 w-full overflow-hidden rounded-full" role="img" aria-label={slices.map((s) => `${s.label} ${Math.round(s.per100Cents / 100)} percent`).join(", ")}>
              {slices.map((s, i) => <div key={s.label} style={{ width: `${Math.max(0.5, s.per100Cents / 100)}%`, background: colorFor(i, s.kind) }} />)}
            </div>
            <ul className="mt-4 divide-y divide-[#E2E8F0] dark:divide-slate-800">
              {slices.map((s, i) => (
                <li key={s.label} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: colorFor(i, s.kind) }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  <span className="nums font-semibold">{formatCents(s.per100Cents)}</span>
                  <span className="nums w-24 text-right text-xs text-slate-500">{formatCents(s.cents)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">The middle number is per $100 you earned; the right is the total for the period.</p>
          </section>
          <section className="card p-5 text-sm" aria-labelledby="lr-h">
            <h2 id="lr-h" className="text-base font-bold tracking-tight">How to read it</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Every dollar has a destination. The goal is for <strong>Kept</strong> to be a number you chose, not what happened to be left.</li>
              <li>Your biggest slice is where a small percent change matters most. Cutting it by 10% is worth more than eliminating three small ones.</li>
              <li>If <strong>Overspent</strong> shows, spending outran income in this window: look for one-time items first, then for the recurring ones in the <Link className="font-semibold underline" href={`/coach/leaks${q}`}>Leak finder</Link>.</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
