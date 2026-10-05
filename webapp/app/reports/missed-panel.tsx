"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { markPocketDeductibleAction } from "@/app/actions/pockets";
import { formatCents } from "@/lib/utils/currency";
import type { MissedItem } from "@/lib/reports/missed";

export function MissedPanel({ items, workspaceId, reviewHref }: { items: MissedItem[]; workspaceId: string; reviewHref: string }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const shown = items.filter((i) => !done.has(i.key));
  const total = shown.reduce((s, i) => s + i.savingCents, 0);

  function mark(i: MissedItem) {
    if (!i.pocketId) return;
    setError(undefined);
    start(async () => {
      const r = await markPocketDeductibleAction(workspaceId, i.pocketId!);
      if (r.ok) setDone((s) => new Set(s).add(i.key)); else setError(r.error);
    });
  }

  return (
    <section className="card p-5 print:hidden" aria-labelledby="md-h">
      <h2 id="md-h" className="text-base font-bold tracking-tight">Deductions to check</h2>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Nothing looks missed in this period. Spending that reads like a business cost is already counted.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Spending in this period that looks like a business cost but is not counted as a deduction. If all of it qualifies, you could set aside about <span className="nums font-semibold">{formatCents(total)}</span> less for tax.</p>
          <ul className="mt-3 divide-y divide-[#E2E8F0] dark:divide-slate-800">
            {shown.map((i) => (
              <li key={i.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{i.title}</p>
                  <p className="text-xs text-slate-500">{i.detail}</p>
                  <p className="nums mt-0.5 text-xs text-slate-500">{formatCents(i.amountCents)} spent · about {formatCents(i.savingCents)} tax saved</p>
                </div>
                {i.kind === "unflagged-pocket"
                  ? <button type="button" className="btn btn-sm min-h-11" disabled={pending} onClick={() => mark(i)}>Mark deductible</button>
                  : <Link className="btn btn-sm min-h-11" href={reviewHref}>Review</Link>}
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="mt-2 text-sm text-neg">{error}</p>}
          <p className="mt-3 text-xs text-slate-500">Based on payee and memo wording. Not tax advice: confirm anything personal, shared or unusual with your tax professional.</p>
        </>
      )}
    </section>
  );
}
