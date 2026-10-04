"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { saveExpenseReviewAction } from "@/app/actions/review";
import { formatCents } from "@/lib/utils/currency";
import { TagList } from "@/components/tag-picker";
import type { ReviewRow as Row, Answer, Value } from "@/lib/reports/review";

const ANSWERS: [Answer, string][] = [["YES", "Yes"], ["NO", "No"], ["UNSURE", "Not sure"]];
const VALUES: [Value, string][] = [["CAPACITY", "Improves capacity"], ["RISK", "Reduces risk"], ["STRENGTH", "Strengthens the business"]];

const chip = (on: boolean, tone: string) =>
  `flex min-h-10 cursor-pointer items-center rounded-full border px-3 text-sm font-medium ${on ? tone : "border-[#E2E8F0] bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`;

export function ReviewRowView({ row, short }: { row: Row; short: string }) {
  const [rev, setRev] = useState<Answer | null>(row.review?.increasesRevenue ?? null);
  const [stew, setStew] = useState<Answer | null>(row.review?.stewardship ?? null);
  const [vals, setVals] = useState<Value[]>(row.review?.strategicValue ?? []);
  const [notes, setNotes] = useState(row.review?.notes ?? "");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const done = rev !== null || stew !== null || vals.length > 0;

  const save = (next: { rev?: Answer | null; stew?: Answer | null; vals?: Value[]; notes?: string }) => {
    const r = next.rev !== undefined ? next.rev : rev, s = next.stew !== undefined ? next.stew : stew, v = next.vals ?? vals, n = next.notes ?? notes;
    start(async () => {
      const res = await saveExpenseReviewAction(row.id, { increasesRevenue: r, strategicValue: v, stewardship: s, notes: n });
      setErr(res.ok ? undefined : res.error);
    });
  };
  const yesNo = (cur: Answer | null, set: (a: Answer) => void, name: string) => (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={name}>
      {ANSWERS.map(([k, l]) => (
        <label key={k} className={chip(cur === k, k === "YES" ? "border-pos/40 bg-pos-soft text-pos" : k === "NO" ? "border-neg/40 bg-neg-soft text-neg" : "border-warn/40 bg-warn-soft text-warn")}>
          <input type="radio" className="sr-only" name={`${name}-${row.id}`} checked={cur === k} onChange={() => set(k)} />{l}
        </label>
      ))}
    </div>
  );

  return (
    <li className="px-4 py-2.5">
      <button type="button" className="flex w-full items-center gap-3 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`size-2.5 shrink-0 rounded-full ${done ? "bg-pos" : "bg-slate-300 dark:bg-slate-600"}`} aria-label={done ? "Reviewed" : "Not reviewed"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{row.payee}</span>
          <span className="block truncate text-xs text-slate-500">{short} · {row.pocket}</span>
        </span>
        <span className="nums shrink-0 text-sm font-bold">{formatCents(row.cents)}</span>
        <ChevronDown className={`size-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {row.tags.length > 0 && <div className="mt-1 pl-5"><TagList tags={row.tags} /></div>}
      {open && (
        <div className="mt-3 space-y-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-950/40">
          <div><p className="mb-1.5 text-sm font-semibold">Does this expense increase revenue or profitability?</p>{yesNo(rev, (a) => { setRev(a); save({ rev: a }); }, "revenue")}</div>
          <div>
            <p className="mb-1.5 text-sm font-semibold">What is its strategic value? <span className="font-normal text-slate-500">(pick any)</span></p>
            <div className="flex flex-wrap gap-2">
              {VALUES.map(([k, l]) => (
                <label key={k} className={chip(vals.includes(k), "border-[#2E6BE6]/40 bg-blue-50 text-[#2E6BE6] dark:bg-blue-950 dark:text-blue-300")}>
                  <input type="checkbox" className="sr-only" checked={vals.includes(k)} onChange={() => { const nv = vals.includes(k) ? vals.filter((x) => x !== k) : VALUES.map(([x]) => x).filter((x) => x === k || vals.includes(x)); setVals(nv); save({ vals: nv }); }} />{l}
                </label>
              ))}
            </div>
          </div>
          <div><p className="mb-1.5 text-sm font-semibold">Stewardship: is it fair, responsible and consistent with the kind of business I want to build?</p>{yesNo(stew, (a) => { setStew(a); save({ stew: a }); }, "stewardship")}</div>
          <label className="block"><span className="label">Note <span className="font-normal text-slate-500">(optional)</span></span>
            <input className="input" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (notes !== (row.review?.notes ?? "")) save({ notes }); }} />
          </label>
          <p className="text-xs text-slate-500" aria-live="polite">{pending ? "Saving…" : "Saved as you tap."}</p>
          {err && <p role="alert" className="text-xs text-neg">{err}</p>}
        </div>
      )}
    </li>
  );
}
