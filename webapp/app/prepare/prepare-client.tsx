"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Info } from "lucide-react";
import { planFor } from "@/lib/prepare-math";
import type { PrepareBase } from "@/lib/prepare";
import { formatCents, parseToCents } from "@/lib/utils/currency";

const pct = (v: string) => { const n = Number(v.replace(/[^\d.]/g, "")); return Number.isFinite(n) ? Math.min(60, Math.max(0, Math.round(n * 100))) : 0; };

export function PrepareClient({ base, isBusiness, wsQuery }: { base: PrepareBase; isBusiness: boolean; wsQuery: string }) {
  const [monthly, setMonthly] = useState("2000");
  const [lump, setLump] = useState("");
  const [setAside, setSetAside] = useState(String(base.taxBps / 100));
  const [marginal, setMarginal] = useState(isBusiness ? String(base.taxBps / 100) : "22");
  const [months, setMonths] = useState("3");

  const plan = useMemo(() => planFor({
    extraMonthlyCents: Math.max(0, parseToCents(monthly) ?? 0), lumpSumCents: Math.max(0, parseToCents(lump) ?? 0),
    taxSetAsideBps: pct(setAside), marginalBps: pct(marginal), monthlyCostCents: base.monthlyCostCents, unfundedCents: base.unfundedCents,
    cushionHeldCents: base.cushionHeldCents, cushionTargetMonths: Number(months), debts: base.debts, hasTaxReservePocket: base.hasTaxReservePocket, isBusiness,
  }), [monthly, lump, setAside, marginal, months, base, isBusiness]);

  const y = plan.yearTotals;
  const rows = [
    { k: "Taxes set aside", v: y.taxSetAsideCents, c: "bg-[#64748B]" },
    { k: "Plan gaps filled", v: y.toGapsCents, c: "bg-[#D97706]" },
    { k: "Cushion", v: y.toCushionCents, c: "bg-water" },
    { k: "Debt paid down", v: y.toDebtCents, c: "bg-[#7C3AED]" },
    { k: "Tax-advantaged savings", v: y.toAdvantagedCents, c: "bg-[#2E6BE6]" },
    { k: "Investing and goals", v: y.toGrowthCents, c: "bg-pos" },
  ].filter((r) => r.v > 0);
  const empty = y.incomeCents === 0;
  const field = "input nums";
  return (
    <div className="space-y-4">
      <section className="card grid gap-3 p-4 sm:grid-cols-2" aria-label="What if">
        <div><label htmlFor="pf-m" className="label">Extra money each month</label><input id="pf-m" inputMode="decimal" className={field} value={monthly} onChange={(e) => setMonthly(e.target.value)} /></div>
        <div><label htmlFor="pf-l" className="label">One-time amount (optional)</label><input id="pf-l" inputMode="decimal" className={field} placeholder="0" value={lump} onChange={(e) => setLump(e.target.value)} /></div>
        <div><label htmlFor="pf-t" className="label">Set aside for tax (%)</label><input id="pf-t" inputMode="decimal" className={field} value={setAside} onChange={(e) => setSetAside(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">{isBusiness ? "Your business reserve rate. Use 0 if tax is already withheld." : "Use 0 for a paycheck with tax withheld. Use a rate for side income."}</p></div>
        <div><label htmlFor="pf-r" className="label">Your tax rate (%)</label><input id="pf-r" inputMode="decimal" className={field} value={marginal} onChange={(e) => setMarginal(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Used to value retirement and HSA savings.</p></div>
        <div className="sm:col-span-2"><label htmlFor="pf-c" className="label">Cushion goal</label>
          <select id="pf-c" className="input" value={months} onChange={(e) => setMonths(e.target.value)}>{[1, 2, 3, 4, 5, 6].map((m) => <option key={m} value={m}>{m} month{m === 1 ? "" : "s"} of costs</option>)}</select></div>
      </section>

      <section className="card space-y-2 p-4" aria-label="Can your plan hold it">
        <h2 className="text-base font-bold">Can your plan hold it?</h2>
        <ul className="space-y-2">
          {plan.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2.5 text-sm">
              {c.state === "good" ? <Check className="mt-0.5 size-4 shrink-0 text-pos" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-indigo-500" aria-hidden />}
              <span><span className="font-semibold">{c.title}.</span> <span className="text-slate-600 dark:text-slate-300">{c.detail}</span></span>
            </li>
          ))}
          {!base.hasGrowthPocket && <li className="flex items-start gap-2.5 text-sm"><Info className="mt-0.5 size-4 shrink-0 text-indigo-500" aria-hidden /><span><span className="font-semibold">Add a pocket for savings and investing.</span> <span className="text-slate-600 dark:text-slate-300">New money for growth needs a home so it does not drift into spending.</span></span></li>}
        </ul>
      </section>

      {empty ? <p className="card p-4 text-sm text-slate-600 dark:text-slate-300">Type an amount above to see where it would go.</p> : (
        <>
          <section className="card space-y-3 p-4" aria-label="Where it would go">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">Where it would go</h2>
              <p className="nums text-sm text-slate-600 dark:text-slate-300">{formatCents(plan.afterTaxMonthlyCents)}/mo{plan.afterTaxLumpCents > 0 && ` + ${formatCents(plan.afterTaxLumpCents)} once`} after tax</p>
            </div>
            <ol className="space-y-3">
              {plan.steps.map((s, i) => (
                <li key={s.key} className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="text-sm font-semibold">{s.title}</span>
                      <span className="nums text-sm font-semibold">{s.monthlyCents > 0 && `${formatCents(s.monthlyCents)}/mo`}{s.monthlyCents > 0 && s.lumpCents > 0 && " + "}{s.lumpCents > 0 && `${formatCents(s.lumpCents)} once`}</span></div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{s.why}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="card space-y-3 p-4" aria-label="First year">
            <h2 className="text-base font-bold">Your first year</h2>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="How the first year of extra money is used">
              {rows.map((r) => <div key={r.k} className={r.c} style={{ flex: r.v }} />)}
            </div>
            <ul className="space-y-1.5 text-sm">
              {rows.map((r) => <li key={r.k} className="flex items-center gap-2"><span className={`size-2.5 shrink-0 rounded-[3px] ${r.c}`} aria-hidden /><span className="flex-1">{r.k}</span><span className="nums font-semibold">{formatCents(r.v)}</span></li>)}
            </ul>
            <dl className="nums grid grid-cols-1 gap-2 border-t border-[#EEF2F7] pt-3 text-sm dark:border-slate-800 sm:grid-cols-3">
              <div><dt className="text-xs text-slate-500">Tax kept by saving smart</dt><dd className="font-semibold text-pos">{formatCents(plan.taxKeptCents)}</dd></div>
              <div><dt className="text-xs text-slate-500">Interest avoided</dt><dd className="font-semibold text-pos">{formatCents(plan.interestAvoidedCents)}</dd></div>
              <div><dt className="text-xs text-slate-500">Cushion after a year</dt><dd className="font-semibold">{plan.cushionMonthsAfter === null ? "n/a" : `${plan.cushionMonthsAfter.toFixed(1)} months`}</dd></div>
            </dl>
          </section>

          <section className="card space-y-1 p-4 text-sm" aria-label="Ways to keep more">
            <h2 className="text-base font-bold">Keeping more of it</h2>
            <ul className="list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-200">
              {isBusiness && <li>A solo 401(k) or SEP-IRA lets a business owner put a large share of profit away before tax. Ask your tax preparer about this year&apos;s limit.</li>}
              <li>An HSA, if you are eligible, is the rare account that is tax-free going in, growing and coming out for health costs.</li>
              {isBusiness && <li>Pay quarterly estimates from the reserve so there are no surprises or penalties in April.</li>}
              <li>Look at <Link className="font-semibold text-blue-700 dark:text-blue-300" href={`/coach/leaks${wsQuery}`}>quiet leaks</Link> too. Subscriptions and rising costs absorb new income fast.</li>
              <li>Raise spending slowly. Letting 70% or more of each raise work for you is what turns extra income into real growth.</li>
            </ul>
          </section>
          <p className="text-xs text-slate-500">An estimate for planning, not tax or investment advice. Limits and rules change, so confirm the details with your preparer.</p>
        </>
      )}
    </div>
  );
}
