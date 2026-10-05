"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CSV_TEMPLATES, parseBankCsv, type CsvTemplateId } from "@/lib/csv";
import { formatCents } from "@/lib/utils/currency";
import { importTransactionsAction, type ImportResult } from "@/app/actions/transactions";
import { suggestForImportAction, type ImportSuggestData } from "@/app/actions/quick";

export function ImportClient({ accounts, initialAccountId, pockets, workspaceLabel, wsQuery }: {
  accounts: { id: string; name: string }[]; initialAccountId: string; pockets: { id: string; name: string; group: string }[]; workspaceLabel: string; wsQuery: string;
}) {
  const [accountId, setAccountId] = useState(initialAccountId);
  const [template, setTemplate] = useState<CsvTemplateId>("auto");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("pasted.csv");
  const [result, setResult] = useState<ImportResult>();
  const [pending, start] = useTransition();
  const [sug, setSug] = useState<ImportSuggestData>();
  const [auto, setAuto] = useState(true);
  const [picked, setPicked] = useState<Record<number, string>>({}); // line -> pocket id ("" = leave for review)

  const parsed = useMemo(() => (text.trim() ? parseBankCsv(text, template) : null), [text, template]);
  const hint = CSV_TEMPLATES.find((t) => t.id === template)?.hint;

  // Look up suggested pockets whenever the rows or the account change.
  useEffect(() => {
    setPicked({});
    if (!parsed || parsed.rows.length === 0) { setSug(undefined); return; }
    let live = true;
    const t = setTimeout(() => {
      suggestForImportAction(accountId, parsed.rows.map((r) => ({ payee: r.payee, memo: r.memo, amountCents: r.amountCents })))
        .then((d) => { if (live) setSug(d); }).catch(() => { if (live) setSug(undefined); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [parsed, accountId]);

  /** The pocket each row will be filed under: the user's pick, else the suggestion when auto is on. */
  const chosen = useMemo(() => parsed?.rows.map((r, i) => {
    const pick = picked[r.line];
    if (pick !== undefined) return pick || null;
    return auto ? sug?.suggestions[i]?.categoryId ?? null : null;
  }) ?? [], [parsed, picked, auto, sug]);
  const suggestedCount = sug?.suggestions.filter(Boolean).length ?? 0;
  const dedMeta = useMemo(() => {
    let n = 0, saved = 0;
    parsed?.rows.forEach((r, i) => {
      const s = sug?.suggestions[i];
      if (s && s.deductible && chosen[i] === s.categoryId) { n++; saved += Math.round((-r.amountCents * (sug?.taxBps ?? 0)) / 10000); }
    });
    return { n, saved };
  }, [parsed, sug, chosen]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
    setResult(undefined);
  }

  function commit() {
    if (!parsed || parsed.rows.length === 0) return;
    start(async () => {
      setResult(await importTransactionsAction({
        accountId,
        fileName,
        rows: parsed.rows.map((r, i) => ({ date: r.date, payee: r.payee, memo: r.memo, amountCents: r.amountCents, categoryId: chosen[i] })),
      }));
    });
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="imp-acct" className="label">Import into ({workspaceLabel})</label>
            <select id="imp-acct" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="imp-tpl" className="label">Column layout</label>
            <select id="imp-tpl" className="input" value={template} onChange={(e) => setTemplate(e.target.value as CsvTemplateId)}>
              {CSV_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </div>
        {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint} A header row is detected automatically; without one, the layout you pick is used.</p>}
        <div>
          <label htmlFor="imp-file" className="label">CSV file</label>
          <input id="imp-file" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} className="input !py-2" />
        </div>
        <div>
          <label htmlFor="imp-text" className="label">…or paste CSV text</label>
          <textarea id="imp-text" value={text} onChange={(e) => { setText(e.target.value); setResult(undefined); }} rows={5} spellCheck={false}
            className="input font-mono text-xs" placeholder={"Date,Payee,Memo,Amount\n10/01/2026,Foodland,Groceries,-84.17\n10/02/2026,Employer,Paycheck,2400.00"} />
        </div>
      </section>

      {parsed && (
        <section className="card overflow-hidden" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#E2E8F0] px-4 py-3 dark:border-slate-800">
            <strong className="text-sm">{parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} ready</strong>
            {parsed.errors.length > 0 && <span className="text-sm text-[#8A5A00]">{parsed.errors.length} skipped</span>}
            <button type="button" className="btn btn-primary ml-auto" disabled={pending || parsed.rows.length === 0 || result?.ok === true} onClick={commit}>
              {pending ? "Importing…" : `Import ${parsed.rows.length} transactions`}
            </button>
          </div>

          {result && (result.ok ? (
            <div className="border-b border-[#E2E8F0] bg-emerald-50 px-4 py-3 text-sm text-[#2E7D32] dark:border-slate-800 dark:bg-emerald-950">
              Imported {result.imported}; skipped {result.duplicates} already-imported duplicate{result.duplicates === 1 ? "" : "s"}.{" "}
              <Link className="font-semibold underline" href={`/accounts/${result.accountId}${wsQuery}`}>Open the account to categorize them →</Link>
            </div>
          ) : (
            <div role="alert" className="border-b border-[#E2E8F0] bg-red-50 px-4 py-3 text-sm text-[#C9372C] dark:border-slate-800 dark:bg-red-950">{result.error}</div>
          ))}

          {suggestedCount > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#E2E8F0] bg-indigo-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-indigo-950/40">
              <label className="flex min-h-[44px] items-center gap-2 font-medium">
                <input type="checkbox" className="h-5 w-5" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                Auto-categorize {suggestedCount} row{suggestedCount === 1 ? "" : "s"} with a suggested pocket
              </label>
              {sug?.isBusiness && dedMeta.n > 0 && (
                <span className="text-xs text-slate-600 dark:text-slate-300">{dedMeta.n} deductible · about <span className="nums font-semibold">{formatCents(dedMeta.saved)}</span> est. tax saved</span>
              )}
            </div>
          )}

          {parsed.errors.length > 0 && (
            <ul className="border-b border-[#E2E8F0] px-4 py-3 text-xs text-[#8A5A00] dark:border-slate-800">
              {parsed.errors.slice(0, 10).map((e) => <li key={e.line}>Line {e.line}: {e.message}</li>)}
              {parsed.errors.length > 10 && <li>…and {parsed.errors.length - 10} more.</li>}
            </ul>
          )}

          {parsed.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead className="border-b border-[#E2E8F0] bg-navy-soft dark:border-slate-800 dark:bg-slate-800/50">
                  <tr><th className="th">Date</th><th className="th">Payee</th><th className="th">Memo</th><th className="th text-right">Amount</th><th className="th">Pocket</th></tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 25).map((r, i) => (
                    <tr key={r.line} className="border-b border-[#E2E8F0] last:border-0 dark:border-slate-800">
                      <td className="td nums whitespace-nowrap">{r.date}</td>
                      <td className="td">{r.payee}</td>
                      <td className="td max-w-xs truncate text-slate-500">{r.memo}</td>
                      <td className={`td nums text-right ${r.amountCents < 0 ? "" : "text-[#2E7D32]"}`}>{formatCents(r.amountCents)}</td>
                      <td className="td">
                        {r.amountCents < 0 ? (
                          <select aria-label={`Pocket for ${r.payee || "row " + r.line}`} className="input !min-h-[44px] !py-1 text-xs" value={chosen[i] ?? ""}
                            onChange={(e) => setPicked((m) => ({ ...m, [r.line]: e.target.value }))}>
                            <option value="">Review later</option>
                            {pockets.map((c) => <option key={c.id} value={c.id}>{c.group} · {c.name}</option>)}
                          </select>
                        ) : <span className="text-xs text-slate-400">Income</span>}
                        {sug?.suggestions[i] && chosen[i] === sug.suggestions[i]!.categoryId && <div className="mt-0.5 text-[11px] text-slate-500">{sug.suggestions[i]!.reason}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 25 && <p className="px-4 py-2 text-xs text-slate-500">Previewing the first 25 of {parsed.rows.length} rows; the rest use their suggestion when auto-categorize is on.</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
