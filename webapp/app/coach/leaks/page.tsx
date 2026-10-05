import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { loadLeaks } from "@/lib/coach/leaks";
import { negotiationScript } from "@/lib/coach/leaks-math";
import { typeLabel } from "@/lib/budget/expense-types";
import { formatCents } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";
const CAD = { monthly: "monthly", quarterly: "every 3 months", yearly: "yearly" } as const;

export default async function LeaksPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";
  const vm = await loadLeaks(ws.id, todayIso());
  const r = vm.report;
  const creepYear = r.creeping.reduce((t, c) => t + c.creep!.perYearCents, 0);
  const maxLeak = Math.max(1, ...vm.leakage.map((m) => m.cents));
  const tile = "card p-4";
  return (
    <div className="space-y-5">
      <Link href={`/coach${q}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300"><ArrowLeft className="size-4" aria-hidden /> Coach</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leak finder</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Money that quietly leaves: charges that repeat, bills that crept up, double charges and overlapping subscriptions. {vm.historyUsed ? "Includes your imported history, so price changes over years show up." : "Import past years in History to catch price changes over a longer stretch."}</p>
      </div>

      <section className="grid grid-cols-2 gap-3" aria-label="Summary">
        <div className={tile}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subscriptions</p><p className="nums mt-1 text-xl font-bold">{formatCents(r.subscriptionMonthlyCents)}<span className="text-sm font-medium text-slate-500">/mo</span></p><p className="nums text-xs text-slate-500">{formatCents(r.subscriptionMonthlyCents * 12)} a year</p></div>
        <div className={tile}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">All recurring</p><p className="nums mt-1 text-xl font-bold">{formatCents(r.recurringMonthlyCents)}<span className="text-sm font-medium text-slate-500">/mo</span></p><p className="nums text-xs text-slate-500">{r.recurring.length} charge{r.recurring.length === 1 ? "" : "s"} on a schedule</p></div>
        <div className={tile}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price increases</p><p className="nums mt-1 text-xl font-bold text-neg">{formatCents(creepYear)}<span className="text-sm font-medium text-slate-500">/yr</span></p><p className="text-xs text-slate-500">{r.creeping.length} bill{r.creeping.length === 1 ? "" : "s"} went up</p></div>
        <div className={tile}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Double charges</p><p className="nums mt-1 text-xl font-bold">{r.doubles.length}</p><p className="text-xs text-slate-500">to check</p></div>
      </section>

      {r.creeping.length > 0 && (
        <section className="card p-5" aria-labelledby="cr-h">
          <h2 id="cr-h" className="text-base font-bold tracking-tight">Bills that went up</h2>
          <ul className="mt-2 divide-y divide-[#E2E8F0] dark:divide-slate-800">
            {r.creeping.map((c) => (
              <li key={c.key} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold">{c.payee}</p>
                  <p className="nums text-sm text-neg">+{c.creep!.pct}% · {formatCents(c.creep!.perYearCents)}/yr</p>
                </div>
                <p className="nums text-xs text-slate-500">{formatCents(c.creep!.fromCents)} → {formatCents(c.creep!.toCents)} ({CAD[c.cadence]}), last charged {c.lastDate}</p>
                <details className="mt-1"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-blue-700 dark:text-blue-300">How to bring it down</summary><p className="text-sm text-slate-700 dark:text-slate-200">{negotiationScript(c.typeKey, c.payee, c.creep!.pct)}</p></details>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.doubles.length > 0 && (
        <section className="card p-5" aria-labelledby="dc-h">
          <h2 id="dc-h" className="text-base font-bold tracking-tight">Possible double charges</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">The same amount from the same payee within a few days. Sometimes it is real; sometimes it is worth a refund request.</p>
          <ul className="mt-2 divide-y divide-[#E2E8F0] dark:divide-slate-800">
            {r.doubles.map((d, i) => <li key={i} className="flex items-baseline justify-between gap-3 py-2.5 text-sm"><span><span className="font-semibold">{d.payee}</span><span className="nums block text-xs text-slate-500">{d.dates[0]} and {d.dates[1]}</span></span><span className="nums font-semibold">{formatCents(d.cents)}</span></li>)}
          </ul>
        </section>
      )}

      {r.overlaps.length > 0 && (
        <section className="card p-5" aria-labelledby="ov-h">
          <h2 id="ov-h" className="text-base font-bold tracking-tight">Possible overlap</h2>
          {r.overlaps.map((o) => (
            <div key={o.typeKey} className="mt-2 text-sm"><p>You pay for <strong>{o.payees.length}</strong> {o.label} services (<span className="nums">{formatCents(o.monthlyCents)}</span>/month): {o.payees.join(", ")}.</p><p className="mt-1 text-slate-600 dark:text-slate-300">Ask of each one: did I use it in the last 30 days, and does another already do the same job?</p></div>
          ))}
        </section>
      )}

      <section className="card p-5" aria-labelledby="all-h">
        <h2 id="all-h" className="text-base font-bold tracking-tight">Everything that repeats</h2>
        {r.recurring.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nothing yet. Recurring charges appear once a payee has charged three times on a schedule (or twice a year apart).</p> : (
          <ul className="mt-2 divide-y divide-[#E2E8F0] dark:divide-slate-800">
            {r.recurring.map((c) => (
              <li key={c.key} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0"><span className="block truncate font-semibold">{c.payee}</span><span className="block text-xs text-slate-500">{CAD[c.cadence]} · {c.count} charges{c.typeKey ? ` · ${typeLabel(c.typeKey)}` : ""}</span></span>
                <span className="nums shrink-0 text-right"><span className="block font-semibold">{formatCents(c.lastCents)}</span><span className="block text-xs text-slate-500">{formatCents(c.monthlyCents)}/mo</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5" aria-labelledby="lk-h">
        <h2 id="lk-h" className="text-base font-bold tracking-tight">Leakage-tagged spending, last 6 months</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Spending you tagged Leakage. The goal is a line that shrinks.</p>
        <ul className="mt-3 space-y-2">
          {vm.leakage.map((m) => (
            <li key={m.month} className="grid grid-cols-[4rem_1fr_auto] items-center gap-3 text-sm">
              <span className="nums text-slate-500">{m.month}</span>
              <span className="h-3 rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={`${formatCents(m.cents)} tagged Leakage in ${m.month}`}><span className="block h-3 rounded-full bg-[#D97706]" style={{ width: `${Math.round((m.cents / maxLeak) * 100)}%` }} /></span>
              <span className="nums">{formatCents(m.cents)}{m.spendCents > 0 && m.cents > 0 ? <span className="text-xs text-slate-500"> · {Math.round((m.cents / m.spendCents) * 100)}%</span> : null}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
