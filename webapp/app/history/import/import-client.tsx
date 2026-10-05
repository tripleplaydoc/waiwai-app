"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CSV_TEMPLATES, parseBankCsv, type CsvTemplateId } from "@/lib/csv";
import { classifyHistoryRow } from "@/lib/history-math";
import { typeLabel } from "@/lib/budget/expense-types";
import { formatCents } from "@/lib/utils/currency";
import { importHistoryAction, type HistoryImportResult } from "@/app/actions/history";

export function HistoryImportClient({ accounts, initialAccountId, isBusiness, wsQuery }: {
  accounts: { id: string; name: string; cutoff: string }[]; initialAccountId: string; isBusiness: boolean; wsQuery: string;
}) {
  const [accountId, setAccountId] = useState(initialAccountId);
  const [template, setTemplate] = useState<CsvTemplateId>("auto");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("pasted.csv");
  const [result, setResult] = useState<HistoryImportResult>();
  const [pending, start] = useTransition();
  const cutoff = accounts.find((a) => a.id === accountId)?.cutoff ?? "";

  const parsed = useMemo(() => (text.trim() ? parseBankCsv(text, template) : null), [text, template]);
  const plan = useMemo(() => {
    if (!parsed) return null;
    const usable = parsed.rows.filter((r) => r.date < cutoff);
    const late = parsed.rows.length - usable.length;
    const classes = usable.map((r) => classifyHistoryRow({ payee: r.payee, memo: r.memo, amountCents: r.amountCents, isBusiness }));
    const years = new Map<string, number>();
    usable.forEach((r) => years.set(r.date.slice(0, 4), (years.get(r.date.slice(0, 4)) ?? 0) + 1));
    return {
      usable, late, classes,
      typed: classes.filter((c) => c.typeKey).length,
      transfers: classes.filter((c) => c.kind === "TRANSFER").length,
      net: usable.reduce((s, r) => s + r.amountCents, 0),
      years: [...years.entries()].sort(),
    };
  }, [parsed, cutoff, isBusiness]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name); setText(await file.text()); setResult(undefined);
  }
  function commit() {
    if (!plan || plan.usable.length === 0) return;
    start(async () => {
      setResult(await importHistoryAction({ accountId, fileName, rows: plan.usable.map((r) => ({ date: r.date, payee: r.payee, memo: r.memo, amountCents: r.amountCents })) }));
    });
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="hi-acct" className="label">Account these rows came from</label>
            <select id="hi-acct" className="input" value={accountId} onChange={(e) => { setAccountId(e.target.value); setResult(undefined); }}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="hi-tpl" className="label">Column layout</label>
            <select id="hi-tpl" className="input" value={template} onChange={(e) => setTemplate(e.target.value as CsvTemplateId)}>
              {CSV_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">History for this account must end before <span className="nums font-semibold">{cutoff}</span>. Rows on or after that day are left out, because your live budget already covers them.</p>
        <div>
          <label htmlFor="hi-file" className="label">CSV file</label>
          <input id="hi-file" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} className="input !py-2" />
        </div>
        <div>
          <label htmlFor="hi-text" className="label">…or paste CSV text</label>
          <textarea id="hi-text" value={text} onChange={(e) => { setText(e.target.value); setResult(undefined); }} rows={5} spellCheck={false} className="input font-mono text-xs" placeholder={"Date,Payee,Memo,Amount\n03/14/2024,Zoom,Monthly,-15.99"} />
        </div>
      </section>

      {parsed && plan && (
        <section className="card overflow-hidden" aria-live="polite">
          <div className="space-y-2 border-b border-[#E2E8F0] px-4 py-3 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-3">
              <strong className="text-sm">{plan.usable.length.toLocaleString()} row{plan.usable.length === 1 ? "" : "s"} ready for history</strong>
              <button type="button" className="btn btn-primary ml-auto min-h-11" disabled={pending || plan.usable.length === 0 || result?.ok === true} onClick={commit}>{pending ? "Importing…" : `Import ${plan.usable.length.toLocaleString()} rows`}</button>
            </div>
            <ul className="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
              <li>Years: {plan.years.map(([y, n]) => `${y} (${n})`).join(", ") || "none"}. Net movement <span className="nums">{formatCents(plan.net)}</span>.</li>
              <li>{plan.typed} typed automatically, {plan.transfers} transfers set aside, {plan.usable.length - plan.typed - plan.transfers} left to name on the History page.</li>
              {plan.late > 0 && <li className="text-[#8A5A00]">{plan.late} row{plan.late === 1 ? "" : "s"} dated on or after {cutoff} will be left out.</li>}
              {parsed.errors.length > 0 && <li className="text-[#8A5A00]">{parsed.errors.length} line{parsed.errors.length === 1 ? "" : "s"} could not be read and will be skipped.</li>}
            </ul>
          </div>
          {result && (result.ok ? (
            <div className="border-b border-[#E2E8F0] bg-emerald-50 px-4 py-3 text-sm text-[#2E7D32] dark:border-slate-800 dark:bg-emerald-950">
              Stored {result.imported.toLocaleString()} in history; {result.duplicates.toLocaleString()} already there{result.tooLate > 0 ? `; ${result.tooLate} left out as too recent` : ""}.{" "}
              <Link className="font-semibold underline" href={`/history${wsQuery}`}>Check it connects to your balance →</Link>
            </div>
          ) : <div role="alert" className="border-b border-[#E2E8F0] bg-red-50 px-4 py-3 text-sm text-[#C9372C] dark:border-slate-800 dark:bg-red-950">{result.error}</div>)}
          {plan.usable.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead className="border-b border-[#E2E8F0] bg-navy-soft dark:border-slate-800 dark:bg-slate-800/50"><tr><th className="th">Date</th><th className="th">Payee</th><th className="th text-right">Amount</th><th className="th">Type</th></tr></thead>
                <tbody>
                  {plan.usable.slice(0, 20).map((r, i) => {
                    const c = plan.classes[i];
                    return (
                      <tr key={r.line} className="border-b border-[#E2E8F0] last:border-0 dark:border-slate-800">
                        <td className="td nums whitespace-nowrap">{r.date}</td>
                        <td className="td">{r.payee}</td>
                        <td className={`td nums text-right ${r.amountCents < 0 ? "" : "text-[#2E7D32]"}`}>{formatCents(r.amountCents)}</td>
                        <td className="td text-xs text-slate-600 dark:text-slate-300">{c.kind === "TRANSFER" ? "Transfer (ignored)" : typeLabel(c.typeKey) ?? <span className="text-slate-400">Name later</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {plan.usable.length > 20 && <p className="px-4 py-2 text-xs text-slate-500">Previewing the first 20 of {plan.usable.length.toLocaleString()} rows.</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
