"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { classifyPayeeAction, clearHistoryAction, setGoLiveAction, setHistoryStartAction } from "@/app/actions/history";
import { typesFor } from "@/lib/budget/expense-types";
import { centsToInput, formatCents } from "@/lib/utils/currency";
import type { HistoryAccountVM, HistoryVM } from "@/lib/history";
import type { YearSummary } from "@/lib/history-math";

const deltaPct = (cur: number, prev: number) => (prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 100));

function Delta({ cur, prev, goodWhenUp }: { cur: number; prev: number | undefined; goodWhenUp: boolean }) {
  if (prev === undefined) return null;
  const p = deltaPct(cur, prev);
  if (p === null || p === 0) return <span className="text-slate-400">{p === 0 ? "0%" : "new"}</span>;
  return <span className={(p > 0) === goodWhenUp ? "text-pos" : "text-neg"}>{p > 0 ? "▲" : "▼"} {Math.abs(p)}%</span>;
}

export function HistoryClient({ vm, workspaceId, isBusiness, taxBps, wsQuery }: { vm: HistoryVM; workspaceId: string; isBusiness: boolean; taxBps: number; wsQuery: string }) {
  return (
    <div className="space-y-5">
      <GoLive workspaceId={workspaceId} goLive={vm.goLive} />
      <Proof accounts={vm.accounts} wsQuery={wsQuery} />
      {vm.payees.length > 0 && <Classify payees={vm.payees} workspaceId={workspaceId} isBusiness={isBusiness} />}
      <Years years={vm.years} isBusiness={isBusiness} taxBps={taxBps} empty={vm.totalRows === 0} wsQuery={wsQuery} />
    </div>
  );
}

function GoLive({ workspaceId, goLive }: { workspaceId: string; goLive: string | null }) {
  const [date, setDate] = useState(goLive ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [pending, start] = useTransition();
  return (
    <section className="card p-5" aria-labelledby="gl-h">
      <h2 id="gl-h" className="text-base font-bold tracking-tight">Go-live day</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">The day your live budget began. Everything before it is history. Your account opening balances are the bridge between the two.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="gl-date" className="label">Live budget began</label>
          <input id="gl-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button type="button" className="btn min-h-11" disabled={pending || !date || date === goLive}
          onClick={() => start(async () => { const r = await setGoLiveAction(workspaceId, date); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); })}>{pending ? "Saving…" : "Save"}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-pos" : "text-neg"}`}>{msg.text}</p>}
      </div>
    </section>
  );
}

function Proof({ accounts, wsQuery }: { accounts: HistoryAccountVM[]; wsQuery: string }) {
  return (
    <section className="card p-5" aria-labelledby="pf-h">
      <h2 id="pf-h" className="text-base font-bold tracking-tight">Does history line up with today?</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">For each account: the balance when its history begins, plus everything imported, should equal the opening balance your live budget started from. When it does, the two layers are proven to connect.</p>
      <ul className="mt-3 divide-y divide-[#E2E8F0] dark:divide-slate-800">
        {accounts.map((a) => <AccountProof key={a.id} a={a} wsQuery={wsQuery} />)}
        {accounts.length === 0 && <li className="py-3 text-sm text-slate-500">No accounts yet.</li>}
      </ul>
    </section>
  );
}

function AccountProof({ a, wsQuery }: { a: HistoryAccountVM; wsQuery: string }) {
  const [date, setDate] = useState(a.startDate ?? "");
  const [bal, setBal] = useState(a.startCents === null ? "" : centsToInput(a.startCents));
  const [msg, setMsg] = useState<string>();
  const [pending, start] = useTransition();
  const b = a.bridge;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{a.name}</span>
        {b.state === "ok" && <span className="inline-flex items-center gap-1 rounded-full bg-pos-soft px-2 py-0.5 text-xs font-semibold text-pos"><CheckCircle2 className="size-3.5" aria-hidden /> Connects</span>}
        {b.state === "off" && <span className="inline-flex items-center gap-1 rounded-full bg-neg-soft px-2 py-0.5 text-xs font-semibold text-neg"><AlertTriangle className="size-3.5" aria-hidden /> Off by <span className="nums">{formatCents(Math.abs(b.gapCents))}</span></span>}
        {b.state === "no-history" && <span className="text-xs text-slate-500">No history imported</span>}
        {b.state === "no-start" && <span className="text-xs text-[#8A5A00]">Enter the starting balance</span>}
        <span className="nums ml-auto text-xs text-slate-500">{a.count > 0 ? `${a.count.toLocaleString()} rows · ${a.firstDate} to ${a.lastDate}` : ""}</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">Live budget opening balance: <span className="nums">{formatCents(a.openingCents)}</span>. History for this account must end before <span className="nums">{a.cutoff}</span>.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`hs-d-${a.id}`} className="label">History begins</label>
          <input id={`hs-d-${a.id}`} type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`hs-b-${a.id}`} className="label">Balance then</label>
          <input id={`hs-b-${a.id}`} inputMode="decimal" className="input nums w-32" placeholder="0.00" value={bal} onChange={(e) => setBal(e.target.value)} />
        </div>
        <button type="button" className="btn min-h-11" disabled={pending}
          onClick={() => start(async () => { const r = await setHistoryStartAction(a.id, date, bal); setMsg(r.ok ? "Saved." : r.error); })}>{pending ? "Saving…" : "Save"}</button>
        {a.count > 0 && (
          <button type="button" className="btn min-h-11" disabled={pending}
            onClick={() => { if (confirm(`Remove all ${a.count} history rows for ${a.name}? Your live budget is not affected.`)) start(async () => { const r = await clearHistoryAction(a.id, null); setMsg(r.ok ? r.message ?? "Removed." : r.error); }); }}>Remove history</button>
        )}
        <Link className="btn btn-sm min-h-11" href={`/history/import${wsQuery}${wsQuery ? "&" : "?"}account=${a.id}`}>Import</Link>
      </div>
      {msg && <p role="status" className="mt-1 text-xs text-slate-600 dark:text-slate-300">{msg}</p>}
      {b.state === "ok" && <p className="mt-2 text-xs text-pos">History ends at <span className="nums">{formatCents(b.impliedCents ?? 0)}</span>, exactly your opening balance.</p>}
      {b.state === "off" && (
        <div className="mt-2 rounded-xl bg-neg-soft p-3 text-xs text-slate-800 dark:text-slate-100">
          <p>History says this account held <span className="nums font-semibold">{formatCents(b.impliedCents ?? 0)}</span> when your live budget began, but the opening balance is <span className="nums font-semibold">{formatCents(a.openingCents)}</span>.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{b.hints.map((h) => <li key={h}>{h}</li>)}</ul>
        </div>
      )}
    </li>
  );
}

function typeOptions(isBusiness: boolean) {
  return [...typesFor("EXPENSE").filter((t) => (t.group === "Business") === isBusiness), ...typesFor("INCOME")];
}

function Classify({ payees, workspaceId, isBusiness }: { payees: HistoryVM["payees"]; workspaceId: string; isBusiness: boolean }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const opts = typeOptions(isBusiness);
  const shown = payees.filter((p) => !done.has(p.payee));
  if (shown.length === 0) return null;
  return (
    <section className="card p-5" aria-labelledby="cl-h">
      <h2 id="cl-h" className="text-base font-bold tracking-tight">Name the biggest unknowns</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">These payees could not be typed automatically. Pick a type once and every past row from that payee follows. This is how years of history get sorted in minutes.</p>
      <ul className="mt-3 divide-y divide-[#E2E8F0] dark:divide-slate-800">
        {shown.map((p) => (
          <li key={p.payee} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{p.payee}</p>
              <p className="nums text-xs text-slate-500">{p.count} row{p.count === 1 ? "" : "s"} · {p.outCents > 0 ? `${formatCents(p.outCents)} out` : ""}{p.outCents > 0 && p.inCents > 0 ? " · " : ""}{p.inCents > 0 ? `${formatCents(p.inCents)} in` : ""}</p>
            </div>
            <select aria-label={`Type for ${p.payee}`} className="input !min-h-11 max-w-[11rem] !py-1 text-xs" defaultValue="" disabled={pending}
              onChange={(e) => { const v = e.target.value; if (!v) return; start(async () => { const r = await classifyPayeeAction(workspaceId, p.payee, v); if (r.ok) setDone((s) => new Set(s).add(p.payee)); else setErr(r.error); }); }}>
              <option value="">Choose a type…</option>
              {opts.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              <option value="TRANSFER">Transfer (ignore)</option>
            </select>
          </li>
        ))}
      </ul>
      {err && <p role="alert" className="mt-2 text-sm text-neg">{err}</p>}
    </section>
  );
}

function Years({ years, isBusiness, taxBps, empty, wsQuery }: { years: YearSummary[]; isBusiness: boolean; taxBps: number; empty: boolean; wsQuery: string }) {
  if (years.length === 0) {
    return (
      <section className="card p-5 text-sm">
        <p className="font-semibold">No history yet.</p>
        <p className="mt-1 text-slate-600 dark:text-slate-300">Import a bank CSV for a past year to see profit and loss by year here.</p>
        <Link href={`/history/import${wsQuery}`} className="btn btn-primary mt-3 min-h-11">Import past years</Link>
      </section>
    );
  }
  const byYear = new Map(years.map((y) => [y.year, y]));
  return (
    <section aria-labelledby="yr-h" className="space-y-3">
      <h2 id="yr-h" className="text-base font-bold tracking-tight">Year by year</h2>
      {empty && <p className="text-xs text-slate-500">Showing your live budget only. Imported history will join it here.</p>}
      {years.map((y) => {
        const prev = byYear.get(y.year - 1);
        const estTax = isBusiness ? Math.round((Math.max(0, y.revenueCents - y.deductibleCents) * taxBps) / 10000) : 0;
        return (
          <article key={y.year} className="card p-5">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-lg font-bold">{y.year}</h3>
              {y.includesLive && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{y.year === new Date().getFullYear() ? "year to date · " : ""}history + live budget</span>}
              {y.unclassifiedCount > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-[#8A5A00] dark:bg-amber-950/40">{y.unclassifiedCount} row{y.unclassifiedCount === 1 ? "" : "s"} without a type</span>}
            </div>
            <dl className="nums mt-3 grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-slate-500">{isBusiness ? "Revenue" : "Income"}</dt><dd className="text-right">{formatCents(y.revenueCents)}</dd><dd className="w-16 whitespace-nowrap text-right text-xs"><Delta cur={y.revenueCents} prev={prev?.revenueCents} goodWhenUp /></dd>
              <dt className="text-slate-500">Expenses</dt><dd className="text-right">{formatCents(y.expenseCents)}</dd><dd className="w-16 whitespace-nowrap text-right text-xs"><Delta cur={y.expenseCents} prev={prev?.expenseCents} goodWhenUp={false} /></dd>
              <dt className="font-semibold">{isBusiness ? "Profit" : "Left over"}</dt><dd className={`text-right font-semibold ${y.netCents < 0 ? "text-neg" : ""}`}>{formatCents(y.netCents)}</dd><dd className="w-16 whitespace-nowrap text-right text-xs"><Delta cur={y.netCents} prev={prev?.netCents} goodWhenUp /></dd>
              {isBusiness && (<><dt className="text-slate-500">Deductible expenses</dt><dd className="text-right">{formatCents(y.deductibleCents)}</dd><dd /></>)}
              {isBusiness && (<><dt className="text-slate-500">Tax at {taxBps / 100}% on profit</dt><dd className="text-right">{formatCents(estTax)}</dd><dd /></>)}
            </dl>
            <details className="mt-3">
              <summary className="min-h-11 cursor-pointer select-none py-2 text-sm font-semibold text-blue-700 dark:text-blue-300">Where it went</summary>
              <ul className="space-y-1 text-sm">
                {y.expenses.map((r) => {
                  const before = prev?.expenses.find((x) => x.key === r.key)?.cents;
                  return <li key={r.key} className="flex items-baseline justify-between gap-3"><span>{r.label}</span><span className="nums flex items-baseline gap-2">{formatCents(r.cents)} <span className="w-12 text-right text-xs"><Delta cur={r.cents} prev={before} goodWhenUp={false} /></span></span></li>;
                })}
              </ul>
            </details>
          </article>
        );
      })}
      <p className="text-xs text-slate-500">An estimate for planning, not tax advice. Meals count at 50%.</p>
    </section>
  );
}
