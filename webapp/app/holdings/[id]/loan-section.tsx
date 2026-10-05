"use client";

import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { saveLoanTermsAction, setHoldingValueAction } from "@/app/actions/holding-detail";
import { centsToInput, formatCents, parseToCents } from "@/lib/utils/currency";
import { compareScenarios, durationLabel, monthYearLabel, paymentToPayoffIn, yearlySummary } from "@/lib/loans";
import type { MetaVM } from "@/lib/reports/holding-meta";
import { Msg, Section } from "./ui";

const cents = (t: string) => (t.trim() === "" ? 0 : parseToCents(t) ?? 0);
const bpsOf = (t: string) => { const n = Number(t.replace(/%/g, "")); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0; };
const money = (n: number) => formatCents(n);

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] px-2 py-2 text-center dark:border-slate-700">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`nums text-base font-bold ${tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : ""}`}>{value}</div>
      {sub && <div className="nums text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function Calculator({ owedCents, aprBps, paymentCents, today }: { owedCents: number; aprBps: number | null; paymentCents: number; today: string }) {
  const [bal, setBal] = useState(centsToInput(owedCents));
  const [rate, setRate] = useState(aprBps != null ? String(aprBps / 100) : "");
  const [pay, setPay] = useState(paymentCents ? centsToInput(paymentCents) : "");
  const [extra, setExtra] = useState("");
  const [lump, setLump] = useState("");
  const [years, setYears] = useState("");
  const [monthly, setMonthly] = useState(false);

  const inp = { balanceCents: cents(bal), aprBps: bpsOf(rate), paymentCents: cents(pay), extraMonthlyCents: cents(extra), lumpSumCents: cents(lump) };
  const sc = useMemo(() => compareScenarios(inp), [inp.balanceCents, inp.aprBps, inp.paymentCents, inp.extraMonthlyCents, inp.lumpSumCents]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasExtra = inp.extraMonthlyCents > 0 || inp.lumpSumCents > 0;
  const targetMonths = Math.round(Number(years) * 12);
  const needed = years && targetMonths > 0 ? paymentToPayoffIn(inp.balanceCents, inp.aprBps, targetMonths) : null;
  const shown = hasExtra ? sc.plan : sc.base;
  const yearly = useMemo(() => yearlySummary(shown.schedule, today), [shown, today]);
  const interestPerMonth = Math.round((inp.balanceCents * inp.aprBps) / 120000);

  const field = (id: string, label: string, value: string, set: (v: string) => void, ph: string, suffix?: string) => (
    <div>
      <label htmlFor={`calc-${id}`} className="label">{label}</label>
      <div className="relative">
        <input id={`calc-${id}`} value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" className="input nums" placeholder={ph} />
        {suffix && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {field("bal", "Balance", bal, setBal, "0.00")}
        {field("rate", "Interest rate", rate, setRate, "6.25", "% / yr")}
        {field("pay", "Monthly payment", pay, setPay, "0.00")}
        {inp.balanceCents > 0 && inp.aprBps > 0 && <div className="col-span-2 -mt-1 text-xs text-slate-500">About <strong className="nums text-slate-700 dark:text-slate-200">{money(interestPerMonth)}</strong> of the first month&apos;s payment is interest.</div>}
      </div>

      <div className="rounded-xl bg-indigo-50 p-3 dark:bg-indigo-950/30">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300"><TrendingDown className="size-3.5" aria-hidden /> What if I pay extra?</h3>
        <div className="grid grid-cols-2 gap-3">
          {field("extra", "Extra every month", extra, setExtra, "0.00")}
          {field("lump", "One-time extra payment", lump, setLump, "0.00")}
        </div>
      </div>

      {inp.balanceCents === 0 ? (
        <p className="text-sm text-pos">Nothing owed. Nothing to calculate.</p>
      ) : sc.base.never ? (
        <div role="alert" className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{inp.paymentCents === 0 ? "Enter a monthly payment to see when this is paid off." : <>This payment doesn&apos;t cover the interest (about {money(interestPerMonth)} a month), so the balance never goes down. {hasExtra && !sc.plan.never ? "With your extra payment it does." : "Try a higher payment."}</>}</span>
        </div>
      ) : null}

      {inp.balanceCents > 0 && !shown.never && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label={hasExtra ? "Paid off (with extra)" : "Paid off"} value={monthYearLabel(today, shown.months)} sub={`in ${durationLabel(shown.months)}`} tone="pos" />
            <Stat label="Total interest" value={money(shown.totalInterestCents)} sub={`total paid ${money(shown.totalPaidCents)}`} tone="neg" />
          </div>
          {hasExtra && !sc.base.never && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
              <div className="font-semibold text-emerald-800 dark:text-emerald-200">You&apos;d be done {durationLabel(sc.monthsSaved)} sooner and save <span className="nums">{money(sc.interestSavedCents)}</span> in interest.</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">Without extra: {monthYearLabel(today, sc.base.months)} · interest {money(sc.base.totalInterestCents)}</div>
            </div>
          )}
        </>
      )}

      {inp.balanceCents > 0 && (
        <div className="rounded-xl border border-[#E2E8F0] p-3 dark:border-slate-700">
          <label htmlFor="calc-years" className="label">I want it paid off in… (years)</label>
          <div className="flex items-center gap-3">
            <input id="calc-years" value={years} onChange={(e) => setYears(e.target.value)} inputMode="decimal" className="input nums max-w-28" placeholder="5" />
            {needed != null && <p className="text-sm">Pay <strong className="nums">{money(needed)}</strong> a month{inp.paymentCents > 0 && needed > inp.paymentCents ? <> (<span className="nums">{money(needed - inp.paymentCents)}</span> more than now)</> : inp.paymentCents > 0 ? " (less than you pay now)" : ""}.</p>}
          </div>
        </div>
      )}

      {inp.balanceCents > 0 && !shown.never && shown.schedule.length > 0 && (
        <details className="rounded-xl border border-[#E2E8F0] dark:border-slate-700">
          <summary className="cursor-pointer px-3 py-3 text-sm font-semibold">Payment schedule</summary>
          <div className="overflow-x-auto px-3 pb-3">
            <div className="mb-2 flex gap-2 text-xs font-semibold">
              <button type="button" onClick={() => setMonthly(false)} className={`rounded-full px-3 py-1.5 ${!monthly ? "bg-navy text-white" : "border border-[#E2E8F0] dark:border-slate-700"}`}>By year</button>
              <button type="button" onClick={() => setMonthly(true)} className={`rounded-full px-3 py-1.5 ${monthly ? "bg-navy text-white" : "border border-[#E2E8F0] dark:border-slate-700"}`}>By month</button>
            </div>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th className="py-1 pr-2 font-semibold">{monthly ? "Month" : "Year"}</th><th className="px-2 text-right font-semibold">Paid</th><th className="px-2 text-right font-semibold">Interest</th><th className="pl-2 text-right font-semibold">Owed after</th></tr></thead>
              <tbody className="nums">
                {monthly
                  ? shown.schedule.slice(0, 360).map((r) => <tr key={r.n} className="border-t border-[#E2E8F0] dark:border-slate-800"><td className="py-1 pr-2">{monthYearLabel(today, r.n)}</td><td className="px-2 text-right">{money(r.paymentCents)}</td><td className="px-2 text-right text-neg">{money(r.interestCents)}</td><td className="pl-2 text-right">{money(r.balanceCents)}</td></tr>)
                  : yearly.map((y) => <tr key={y.year} className="border-t border-[#E2E8F0] dark:border-slate-800"><td className="py-1 pr-2">{y.year}</td><td className="px-2 text-right">{money(y.paidCents)}</td><td className="px-2 text-right text-neg">{money(y.interestCents)}</td><td className="pl-2 text-right">{money(y.endBalanceCents)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

export function LoanSection({ accountId, meta, owedCents, paymentCents, today }: { accountId: string; meta: MetaVM; owedCents: number; paymentCents: number; today: string }) {
  const [terms, termsAction, termsPending] = useActionState(saveLoanTermsAction, undefined);
  const [bal, balAction, balPending] = useActionState(setHoldingValueAction, undefined);
  const calcKey = `${owedCents}-${meta.aprBps}-${paymentCents}`;
  return (
    <>
      <Section title="Payoff calculator" hint="Change any number to try it out. Nothing here is saved until you save your loan details below.">
        <Calculator key={calcKey} owedCents={owedCents} aprBps={meta.aprBps} paymentCents={paymentCents} today={today} />
      </Section>
      <Section title="Loan details">
        <form action={termsAction} className="space-y-3">
          <input type="hidden" name="accountId" value={accountId} />
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="ln-rate" className="label">Interest rate (% per year)</label><input id="ln-rate" name="rate" inputMode="decimal" defaultValue={meta.aprBps != null ? String(meta.aprBps / 100) : ""} className="input nums" placeholder="6.25" /></div>
            <div><label htmlFor="ln-pay" className="label">Monthly payment</label><input id="ln-pay" name="payment" inputMode="decimal" defaultValue={paymentCents ? centsToInput(paymentCents) : ""} className="input nums" placeholder="0.00" /></div>
            <div><label htmlFor="ln-orig" className="label">Original amount</label><input id="ln-orig" name="original" inputMode="decimal" defaultValue={meta.originalCents != null ? centsToInput(meta.originalCents) : ""} className="input nums" placeholder="0.00" /></div>
            <div><label htmlFor="ln-term" className="label">Loan length (months)</label><input id="ln-term" name="termMonths" inputMode="numeric" defaultValue={meta.termMonths ?? ""} className="input nums" placeholder="360" /></div>
          </div>
          <div><label htmlFor="ln-start" className="label">Loan started</label><input id="ln-start" name="startDate" type="date" defaultValue={meta.loanStartDate ?? ""} className="input" /></div>
          <div className="flex items-center gap-3"><button type="submit" className="btn btn-primary" disabled={termsPending}>{termsPending ? "Saving…" : "Save loan details"}</button><Msg state={terms} /></div>
        </form>
        <form action={balAction} className="mt-5 grid grid-cols-2 gap-3 border-t border-[#E2E8F0] pt-4 dark:border-slate-800">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="note" value="Statement balance" />
          <div className="col-span-2 text-xs text-slate-500">Update what you owe from your latest statement. Each balance is kept so the reports show your progress.</div>
          <div><label htmlFor="ln-bal" className="label">Balance now (was {formatCents(owedCents)})</label><input id="ln-bal" name="value" required inputMode="decimal" className="input nums" placeholder="0.00" /></div>
          <div><label htmlFor="ln-asof" className="label">As of</label><input id="ln-asof" name="asOf" type="date" defaultValue={today} className="input" /></div>
          <div className="col-span-2 flex items-center gap-3"><button type="submit" className="btn" disabled={balPending}>{balPending ? "Saving…" : "Update balance"}</button><Msg state={bal} /></div>
        </form>
      </Section>
    </>
  );
}
