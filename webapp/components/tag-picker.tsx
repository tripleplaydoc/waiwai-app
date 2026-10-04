"use client";

import { useState, useTransition } from "react";
import { Tag } from "lucide-react";
import { Popover } from "@/components/popover";
import { setTransactionTagsAction } from "@/app/actions/transactions";
import { EXPENSE_TAGS, TAG_DEFS, type ExpenseTagKey } from "@/lib/budget/expense-tags";

/** Tag chips for a form: each selected chip posts `tags=<KEY>`. */
export function TagChips({ idPrefix, defaultValue = [] }: { idPrefix: string; defaultValue?: ExpenseTagKey[] }) {
  const [sel, setSel] = useState<Set<ExpenseTagKey>>(new Set(defaultValue));
  return (
    <fieldset>
      <legend className="label">Tags <span className="font-normal text-slate-500">(pick any)</span></legend>
      <div className="flex flex-wrap gap-2">
        {EXPENSE_TAGS.map((k) => {
          const on = sel.has(k);
          return (
            <label key={k} htmlFor={`${idPrefix}-${k}`} title={TAG_DEFS[k].hint}
              className={`flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${on ? TAG_DEFS[k].chip : "border-[#E2E8F0] bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
              <input id={`${idPrefix}-${k}`} type="checkbox" name="tags" value={k} checked={on} className="sr-only"
                onChange={() => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />
              {TAG_DEFS[k].label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function TagList({ tags }: { tags: ExpenseTagKey[] }) {
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((k) => <span key={k} className={`rounded-full border px-1.5 text-[11px] font-medium ${TAG_DEFS[k].chip}`}>{TAG_DEFS[k].label}</span>)}
    </span>
  );
}

/** On an existing transaction: shows its tags and lets you change them. */
export function TagEditor({ transactionId, tags }: { transactionId: string; tags: ExpenseTagKey[] }) {
  const [sel, setSel] = useState<ExpenseTagKey[]>(tags);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const toggle = (k: ExpenseTagKey) => {
    const next = sel.includes(k) ? sel.filter((x) => x !== k) : EXPENSE_TAGS.filter((x) => x === k || sel.includes(x));
    setSel(next);
    start(async () => { const r = await setTransactionTagsAction(transactionId, next); if (!r.ok) { setErr(r.error); setSel(sel); } else setErr(undefined); });
  };
  return (
    <Popover
      width="w-64 max-w-[calc(100vw-4rem)]"
      icon={<Tag className="size-3.5 text-slate-500" aria-hidden />}
      label={sel.length === 0 ? "Tag" : <span className="flex flex-wrap gap-1">{sel.map((k) => <span key={k} className="flex items-center gap-1"><i className="inline-block size-2 rounded-full" style={{ background: TAG_DEFS[k].dot }} />{TAG_DEFS[k].label}</span>)}</span>}
    >
      <p className="mb-2 text-xs font-bold">Tags</p>
      <ul className="space-y-1">
        {EXPENSE_TAGS.map((k) => (
          <li key={k}>
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 size-5" checked={sel.includes(k)} disabled={pending} onChange={() => toggle(k)} />
              <span><span className="font-semibold">{TAG_DEFS[k].label}</span><span className="block text-xs text-slate-500">{TAG_DEFS[k].hint}</span></span>
            </label>
          </li>
        ))}
      </ul>
      {err && <p role="alert" className="mt-1 text-xs text-neg">{err}</p>}
    </Popover>
  );
}
