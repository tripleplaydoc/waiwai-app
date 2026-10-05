import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { buildPnl, taxRateBps } from "@/lib/reports/pnl";
import { estimatedDueDates, nextDue, projectYear, SCORP_DISCUSS_FROM_CENTS } from "@/lib/coach/tax-math";
import { formatCents } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/dates";
import { LeverCalc } from "./lever-calc";

export const dynamic = "force-dynamic";

export default async function TaxCoachPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const ws = await getWorkspace(wsKey);
  const back = <Link href={`/coach${wsKey === "business" ? "?ws=business" : ""}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300"><ArrowLeft className="size-4" aria-hidden /> Coach</Link>;
  if (ws.type !== "BUSINESS") {
    return <div className="space-y-4">{back}<h1 className="text-2xl font-semibold tracking-tight">Tax levers</h1><div className="card p-5 text-sm">Tax planning works from your business profit. <Link className="font-semibold underline" href="/coach/tax?ws=business">Open it on the Business side</Link>.</div></div>;
  }
  const today = todayIso();
  const year = today.slice(0, 4);
  const [pnl, bps] = await Promise.all([
    buildPnl(ws.id, { from: `${year}-01-01`, to: today, prevFrom: `${Number(year) - 1}-01-01`, prevTo: `${Number(year) - 1}-12-31` }),
    taxRateBps(ws.id),
  ]);
  const ytdProfit = pnl.revenueCents - pnl.deductibleCents;
  const projected = projectYear(ytdProfit, today);
  const est = (c: number) => Math.round((Math.max(0, c) * bps) / 10000);
  const due = nextDue(today);
  const q4 = `${year}-10-01` <= today;
  return (
    <div className="space-y-5">
      {back}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tax levers</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Where you stand this year, and what each choice changes. Every dollar of deduction lowers the tax set-aside by about {bps / 100} cents. Planning guidance, not tax advice: confirm moves with your CPA.</p>
      </div>

      <section className="card p-5" aria-labelledby="st-h">
        <h2 id="st-h" className="text-base font-bold tracking-tight">{year} so far</h2>
        <dl className="nums mt-3 grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
          <dt className="text-slate-500">Revenue</dt><dd className="text-right">{formatCents(pnl.revenueCents)}</dd>
          <dt className="text-slate-500">Deductible expenses</dt><dd className="text-right">− {formatCents(pnl.deductibleCents)}</dd>
          <dt className="font-medium">Taxable profit so far</dt><dd className="text-right font-medium">{formatCents(ytdProfit)}</dd>
          <dt className="text-slate-500">Tax to set aside at {bps / 100}%</dt><dd className="text-right font-semibold text-warn">{formatCents(est(ytdProfit))}</dd>
          <dt className="text-slate-500">Already paid in estimates</dt><dd className="text-right">{formatCents(pnl.taxPaymentsCents)}</dd>
          <dt className="text-slate-500">If the year continues at this pace</dt><dd className="text-right">{formatCents(projected)} profit · {formatCents(est(projected))} tax</dd>
        </dl>
        {projected >= SCORP_DISCUSS_FROM_CENTS && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-[#8A5A00] dark:bg-amber-950/40">At this pace your profit is high enough that it is worth asking your CPA whether an S-corporation election would lower your total tax (it changes how self-employment tax applies, but adds payroll and filing costs).</p>}
      </section>

      <section className="card p-5" aria-labelledby="qd-h">
        <h2 id="qd-h" className="text-base font-bold tracking-tight">Estimated tax dates</h2>
        <ul className="mt-2 divide-y divide-[#E2E8F0] text-sm dark:divide-slate-800">
          {estimatedDueDates(today).slice(1).map((d) => (
            <li key={d.date} className={`flex items-baseline justify-between gap-3 py-2.5 ${due?.date === d.date ? "font-semibold" : d.daysAway < 0 ? "text-slate-400" : ""}`}>
              <span>{d.label} <span className="font-normal text-slate-500">({d.period})</span></span>
              <span className="nums">{d.date}{due?.date === d.date ? ` · in ${d.daysAway} days` : d.daysAway < 0 ? " · past" : ""}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">To avoid underpayment penalties, a common safe harbor is paying at least 90% of this year&apos;s tax or 100% of last year&apos;s (110% if your income was high). Your CPA can tell you which fits.</p>
        <Link href="/budget?ws=business" className="btn mt-3 min-h-11">Pay an estimate from the Tax Reserve</Link>
      </section>

      <LeverCalc taxBps={bps} ytdProfitCents={ytdProfit} q4={q4} />

      <section className="card p-5" aria-labelledby="ye-h">
        <h2 id="ye-h" className="text-base font-bold tracking-tight">Year-end checklist</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
          <li>Open <Link className="font-semibold underline" href="/reports?ws=business&tab=pnl">Deductions to check</Link> and fix anything marked missed.</li>
          <li>Categorize every uncategorized purchase so the totals are complete.</li>
          <li>Equipment you will need anyway: buying before Dec 31 can deduct it this year (limits apply).</li>
          <li>Retirement plan contributions for self-employed people (such as a SEP IRA or Solo 401k) have deadlines and limits. Ask your CPA how much room you have.</li>
          <li>Save receipts and a mileage log for anything you plan to claim.</li>
          <li>Pay the Q4 estimate by Jan 15, then book a quick CPA review with your Schedule C totals (Reports → History → Schedule C by year).</li>
        </ul>
      </section>
    </div>
  );
}
