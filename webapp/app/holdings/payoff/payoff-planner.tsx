"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatCents, parseToCents } from "@/lib/utils/currency";
import { durationLabel, monthYearLabel, planDebts, type Strategy } from "@/lib/loans";

export interface PlannerDebt { id: string; name: string; label: string; balanceCents: number; aprBps: number | null; paymentCents: number; href: string; defaultOn: boolean }

export function PayoffPlanner({ debts, today }: { debts: PlannerDebt[]; today: string }) {
  const [extra, setExtra] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("AVALANCHE");
  const [off, setOff] = useState<Set<string>>(new Set(debts.filter((d) => !d.defaultOn).map((d) => d.id)));
  const extraCents = extra.trim() === "" ? 0 : parseToCents(extra) ?? 0;
  const active = debts.filter((d) => !off.has(d.id));
  const input = active.map((d) => ({ id: d.id, name: d.name, balanceCents: d.balanceCents, aprBps: d.aprBps ?? 0, minPaymentCents: d.paymentCents }));
  const plan = useMemo(() => planDebts(input, extraCents, strategy), [JSON.stringify(input), extraCents, strategy]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = useMemo(() => planDebts(input, 0, strategy), [JSON.stringify(input), strategy]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = active.filter((d) => d.aprBps == null || d.paymentCents === 0);
  const toggle = (id: string) => setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const money = formatCents;
  const byId = new Map(debts.map((d) => [d.id, d]));
  const totalOwed = active.reduce((s, d) => s + d.balanceCents, 0);

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <div>
          <label htmlFor="pp-extra" className="label">Extra you can put toward debt each month</label>
          <input id="pp-extra" value={extra} onChange={(e) => setExtra(e.target.value)} inputMode="decimal" className="input nums max-w-48" placeholder="0.00" />
        </div>
        <div role="radiogroup" aria-label="Strategy" className="grid grid-cols-2 gap-2 text-sm font-semibold">
          {([["AVALANCHE", "Avalanche", "Highest rate first. Costs the least interest."], ["SNOWBALL", "Snowball", "Smallest balance first. Quick wins keep you going."]] as const).map(([k, t, d]) => (
            <button key={k} type="button" role="radio" aria-checked={strategy === k} onClick={() => setStrategy(k)} className={`rounded-xl border px-3 py-2.5 text-left ${strategy === k ? "border-[#2E6BE6] bg-indigo-50 dark:bg-indigo-950/40" : "border-[#E2E8F0] dark:border-slate-700"}`}>
              <div>{t}</div><div className="text-[11px] font-normal text-slate-500">{d}</div>
            </button>
          ))}
        </div>
      </section>

      {missing.length > 0 && (
        <div role="alert" className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Add the interest rate and monthly payment for {missing.map((d, i) => <span key={d.id}>{i > 0 && ", "}<Link href={d.href} className="font-semibold underline">{d.name}</Link></span>)} for an accurate plan. Until then a missing rate counts as 0%.</span>
        </div>
      )}

      {active.length === 0 ? <p className="text-sm text-slate-500">Turn on at least one debt below.</p> : plan.never ? (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">With these payments the debts never clear: at least one monthly payment doesn&apos;t cover its interest. Raise a payment or add extra.</div>
      ) : (
        <>
          <section className="card grid grid-cols-2 divide-x divide-[#E2E8F0] text-center dark:divide-slate-800" aria-label="Plan result">
            <div className="px-2 py-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Debt-free</div><div className="nums text-lg font-bold text-pos">{monthYearLabel(today, plan.months)}</div><div className="text-[11px] text-slate-500">in {durationLabel(plan.months)}</div></div>
            <div className="px-2 py-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total interest</div><div className="nums text-lg font-bold text-neg">{money(plan.totalInterestCents)}</div><div className="nums text-[11px] text-slate-500">on {money(totalOwed)} owed</div></div>
          </section>
          {extraCents > 0 && !base.never && (
            <p className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              Extra <span className="nums">{money(extraCents)}</span>/mo gets you debt-free {durationLabel(base.months - plan.months)} sooner and saves <span className="nums">{money(base.totalInterestCents - plan.totalInterestCents)}</span> in interest.
            </p>
          )}
          <section className="card overflow-hidden" aria-label="Payoff order">
            <h2 className="bg-group px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">Payoff order</h2>
            <ol className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
              {plan.order.map((id, i) => { const d = byId.get(id)!; return (
                <li key={id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{d.name}</div><div className="nums truncate text-xs text-slate-500">{d.aprBps != null ? `${d.aprBps / 100}%` : "no rate"} · {money(d.balanceCents)} owed</div></div>
                  <div className="shrink-0 text-right text-sm font-bold text-pos">{monthYearLabel(today, plan.payoffMonth[id])}</div>
                </li>
              ); })}
            </ol>
          </section>
        </>
      )}

      <section className="card overflow-hidden" aria-label="Debts to include">
        <h2 className="border-b border-[#E2E8F0] bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">Debts in this plan</h2>
        <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
          {debts.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2">
              <input id={`pp-${d.id}`} type="checkbox" checked={!off.has(d.id)} onChange={() => toggle(d.id)} className="size-5 shrink-0 accent-indigo-600" />
              <label htmlFor={`pp-${d.id}`} className="min-h-11 min-w-0 flex-1 py-1.5">
                <div className="truncate text-sm font-semibold">{d.name}</div>
                <div className="nums truncate text-xs text-slate-500">{d.label} · {d.aprBps != null ? `${d.aprBps / 100}%` : "no rate"} · pays {money(d.paymentCents)}/mo</div>
              </label>
              <div className="nums shrink-0 text-sm font-bold">{money(d.balanceCents)}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
