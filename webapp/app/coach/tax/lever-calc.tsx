"use client";

import { useMemo, useState } from "react";
import { homeOfficeSimplifiedCents, leverSavings, mileageDeductionCents } from "@/lib/coach/tax-math";
import { formatCents, parseToCents } from "@/lib/utils/currency";

export function LeverCalc({ taxBps, ytdProfitCents, q4 }: { taxBps: number; ytdProfitCents: number; q4: boolean }) {
  const [retire, setRetire] = useState("");
  const [equip, setEquip] = useState("");
  const [miles, setMiles] = useState("");
  const [rate, setRate] = useState("0.70");
  const [sqft, setSqft] = useState("");
  const c = (s: string) => Math.max(0, parseToCents(s) ?? 0);
  const lines = useMemo(() => {
    const r = c(retire), e = c(equip);
    const m = mileageDeductionCents(Number(miles) || 0, Math.round((Number(rate) || 0) * 100));
    const h = homeOfficeSimplifiedCents(Number(sqft) || 0);
    return [
      { label: "Retirement contribution", cents: r }, { label: "Equipment bought this year", cents: e },
      { label: "Business mileage", cents: m }, { label: "Home office (simplified)", cents: h },
    ];
  }, [retire, equip, miles, rate, sqft]);
  const total = lines.reduce((t, l) => t + l.cents, 0);
  const field = "input nums";
  return (
    <section className="card p-5" aria-labelledby="lv-h">
      <h2 id="lv-h" className="text-base font-bold tracking-tight">What would each move save?</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{q4 ? "It is the last quarter, so these are the moves still open." : "Try a few amounts."} Savings use your {taxBps / 100}% reserve rate as an estimate.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="lv-r" className="label">Retirement contribution ($)</label><input id="lv-r" inputMode="decimal" className={field} value={retire} onChange={(e) => setRetire(e.target.value)} placeholder="0.00" /></div>
        <div><label htmlFor="lv-e" className="label">Equipment you need anyway ($)</label><input id="lv-e" inputMode="decimal" className={field} value={equip} onChange={(e) => setEquip(e.target.value)} placeholder="0.00" /></div>
        <div><label htmlFor="lv-m" className="label">Business miles driven</label><input id="lv-m" inputMode="numeric" className={field} value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="0" /></div>
        <div><label htmlFor="lv-rate" className="label">IRS rate per mile ($, confirm the current one)</label><input id="lv-rate" inputMode="decimal" className={field} value={rate} onChange={(e) => setRate(e.target.value)} /></div>
        <div><label htmlFor="lv-s" className="label">Home office square feet (max 300)</label><input id="lv-s" inputMode="numeric" className={field} value={sqft} onChange={(e) => setSqft(e.target.value)} placeholder="0" /></div>
      </div>
      <ul className="nums mt-4 divide-y divide-[#E2E8F0] text-sm dark:divide-slate-800" aria-live="polite">
        {lines.filter((l) => l.cents > 0).map((l) => <li key={l.label} className="flex justify-between gap-3 py-2"><span>{l.label} <span className="text-slate-500">{formatCents(l.cents)}</span></span><span className="font-semibold text-pos">saves {formatCents(leverSavings(l.cents, taxBps))}</span></li>)}
        <li className="flex justify-between gap-3 py-2 font-bold"><span>All together</span><span className="text-pos">{formatCents(leverSavings(total, taxBps))} less tax</span></li>
        {ytdProfitCents > 0 && total > 0 && <li className="py-2 text-xs text-slate-500">Taxable profit would drop from {formatCents(ytdProfitCents)} to {formatCents(Math.max(0, ytdProfitCents - total))}.</li>}
      </ul>
      <p className="mt-2 text-xs text-slate-500">Retirement contributions lower income tax but not self-employment tax, so the real saving is a little less than shown. Do not spend money you do not need just to get a deduction: you still spend $1 to save about {taxBps / 100} cents.</p>
    </section>
  );
}
