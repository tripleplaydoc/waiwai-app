"use client";

import { useEffect, useState } from "react";
import { Inbox, Search, X } from "lucide-react";
import { matchesSearch } from "@/lib/search-text";

/**
 * Search box plus a "Needs a category" chip for the transaction list below it.
 * The lists are rendered on the server (they hold forms and server actions), so each row carries
 * `data-tx`, `data-s` (its searchable text) and `data-uncat`, and this bar shows or hides rows by those.
 */
export function TxFilterBar({ loaded, uncategorized }: { loaded: number; uncategorized: number }) {
  const [q, setQ] = useState("");
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [shown, setShown] = useState(loaded);

  useEffect(() => {
    const rows = document.querySelectorAll<HTMLElement>("[data-tx]");
    // Phone cards and the desktop table hold the same rows; count each row once.
    let n = 0, counted = new Set<string>();
    rows.forEach((el) => {
      const ok = matchesSearch([el.dataset.s], q) && (!onlyTodo || el.dataset.uncat === "1");
      el.style.display = ok ? "" : "none";
      if (ok && el.dataset.tx && !counted.has(el.dataset.tx)) { counted.add(el.dataset.tx); n++; }
    });
    setShown(n);
    return () => rows.forEach((el) => { el.style.display = ""; });
  }, [q, onlyTodo, loaded, uncategorized]);

  const active = q.trim().length > 0 || onlyTodo;
  return (
    <div className="space-y-2" role="search" aria-label="Find a transaction">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <label htmlFor="tx-q" className="sr-only">Search transactions by payee, memo, category or amount</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input id="tx-q" type="search" autoComplete="off" enterKeyHint="search" className="input !pl-10 !pr-12 [&::-webkit-search-cancel-button]:hidden" placeholder="Search payee, memo or amount"
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} />
          {q && <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"><X className="size-4" aria-hidden /></button>}
        </div>
        {uncategorized > 0 && (
          <button type="button" aria-pressed={onlyTodo} onClick={() => setOnlyTodo((v) => !v)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold ${onlyTodo ? "border-[#D97706] bg-[#FEF3C7] text-[#8A5A00] dark:bg-amber-900/40 dark:text-amber-200" : "border-[#E2E8F0] bg-white dark:border-slate-700 dark:bg-slate-900"}`}>
            <Inbox className="size-4 text-[#D97706]" aria-hidden /> Needs a category <span className="nums rounded-full bg-[#FEF3C7] px-2 py-0.5 text-xs font-bold text-[#8A5A00] dark:bg-amber-900/40 dark:text-amber-200">{uncategorized}</span>
          </button>
        )}
      </div>
      <p role="status" className="text-sm text-slate-600 dark:text-slate-300">
        {active ? <><span className="nums">{shown.toLocaleString()}</span> of <span className="nums">{loaded.toLocaleString()}</span> transactions shown{loaded >= 300 ? " (the latest ones)" : ""}</> : <span className="hidden [@media(pointer:coarse)]:inline">Tip: swipe a transaction sideways to pick its category.</span>}
        {active && <button type="button" onClick={() => { setQ(""); setOnlyTodo(false); }} className="ml-3 inline-flex min-h-11 items-center font-semibold text-[#2E6BE6] underline dark:text-indigo-300">Show everything</button>}
      </p>
    </div>
  );
}
