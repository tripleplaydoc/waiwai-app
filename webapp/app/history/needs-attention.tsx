"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Inbox, Lock } from "lucide-react";
import { Hint } from "@/components/hint";
import { setReviewRowAction } from "@/app/actions/history";
import { amountText, matchesSearch } from "@/lib/search-text";
import { formatCents } from "@/lib/utils/currency";
import { typeOptionsFor } from "./type-options";

export interface AttentionRow { id: string; date: string; amountCents: number; payee: string; memo: string; account: string; sealed: boolean }

/** The "Needs attention" inbox: history rows that still have no type. One tap on the menu files a row and it leaves the list. */
export function NeedsAttention({ rows, total, q, workspaceId, isBusiness, wsQuery }: { rows: AttentionRow[]; total: number; q: string; workspaceId: string; isBusiness: boolean; wsQuery: string }) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  // Rows filed a moment ago still sit in `rows` until the refresh lands; once it does, `total` already excludes them.
  const pendingGone = rows.filter((r) => done.has(r.id)).length;
  const left = Math.max(0, total - pendingGone);
  const shown = rows.filter((r) => !done.has(r.id) && matchesSearch([r.payee, r.memo, r.account, r.date, amountText(r.amountCents)], q));
  const sep = wsQuery ? "&ws=business" : "";
  return (
    <section className="card border-[#D97706]/50 p-5" aria-labelledby="na-h">
      <div className="flex flex-wrap items-center gap-2">
        <Inbox className="size-5 text-[#D97706]" aria-hidden />
        <h2 id="na-h" className="text-base font-bold tracking-tight">Needs attention</h2>
        <span className="nums rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-bold text-[#8A5A00] dark:bg-amber-900/40 dark:text-amber-200" aria-label={`${left} rows need a type`}>{left.toLocaleString()}</span>
        <Hint>These past rows have no type yet, so they are not in your yearly totals. Pick a type from the menu and the row is filed. Pick Exclude for transfers between your own accounts.</Hint>
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{left === 0 ? "All caught up." : "Past transactions waiting for a type. Newest first."}</p>
      <ul className="mt-2 divide-y divide-[#E2E8F0] dark:divide-slate-800">
        {shown.map((r) => <Item key={r.id} r={r} workspaceId={workspaceId} isBusiness={isBusiness} onDone={() => { setDone((s) => new Set(s).add(r.id)); router.refresh(); }} />)}
        {shown.length === 0 && <li className="py-3 text-sm text-slate-500">{q.trim() ? "Nothing here matches your search." : "Nothing loaded here."}</li>}
      </ul>
      <div className="mt-2 flex flex-wrap gap-x-4">
        <Link href={`/history/rows?todo=1${sep}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-[#2E6BE6] underline dark:text-indigo-300">
          {left > rows.length - pendingGone ? `See all ${left.toLocaleString()} in History rows →` : "Open in History rows →"}
        </Link>
        <Link href={`/history/review${wsQuery}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-[#2E6BE6] underline dark:text-indigo-300">Go through a whole year →</Link>
      </div>
    </section>
  );
}

function Item({ r, workspaceId, isBusiness, onDone }: { r: AttentionRow; workspaceId: string; isBusiness: boolean; onDone: () => void }) {
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const opts = typeOptionsFor(r.amountCents < 0 ? "out" : "in", isBusiness);
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-40">
          <p className="truncate text-sm font-semibold">{r.payee || "(no payee)"}</p>
          <p className="nums truncate text-xs text-slate-500">{r.date} · {r.account}{r.memo ? ` · ${r.memo}` : ""}</p>
        </div>
        <p className={`nums text-sm font-semibold ${r.amountCents > 0 ? "text-pos" : ""}`}>{formatCents(r.amountCents)}</p>
        {r.sealed ? <span className="inline-flex min-h-11 items-center gap-1 text-xs text-slate-500"><Lock className="size-3.5" aria-hidden /> Sealed year</span> : (
          <select aria-label={`Type for ${r.payee || "no payee"} on ${r.date}, ${formatCents(r.amountCents)}`} className="input !min-h-11 w-full !py-1 text-sm sm:w-56" defaultValue="" disabled={pending}
            onChange={(e) => { const v = e.target.value; if (!v) return; start(async () => { const x = await setReviewRowAction(workspaceId, r.id, v); if (x.ok) { setErr(undefined); onDone(); } else setErr(x.error); }); }}>
            <option value="">{pending ? "Saving…" : "Choose a type…"}</option>
            {opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            <option value="TRANSFER">Exclude (transfer or not business)</option>
          </select>
        )}
      </div>
      {err && <p role="alert" className="mt-1 text-xs text-neg">{err}</p>}
    </li>
  );
}
