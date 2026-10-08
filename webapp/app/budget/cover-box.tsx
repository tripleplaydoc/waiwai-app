"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { formatCents } from "@/lib/utils/currency";
import { Hint } from "@/components/hint";

export interface CoverItem { id: string; name: string; group: string; needCents: number }

/** The "Cover this month?" box. When something is still to assign, tap it to see which pockets need what. */
export function CoverBox({ ahead, anyTargets, text, canCover, stillCents, rtaCents, shortfallCents, items, children }: {
  ahead: boolean; anyTargets: boolean; text: string; canCover: boolean; stillCents: number; rtaCents: number; shortfallCents: number; items: CoverItem[]; children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const tone = canCover ? "text-pos" : "text-warn";
  const bar = canCover ? "bg-pos" : "bg-warn";
  const value = stillCents === 0 ? 1 : Math.min(1, Math.max(0, rtaCents) / stillCents);
  const canOpen = anyTargets && items.length > 0 && stillCents > 0;
  const labelText = ahead ? "Cover this month and next?" : "Cover this month?";
  const label = (
    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {labelText}
      <Hint label="What does this mean?">
        This checks whether the money in your pool is enough to fund everything your pockets still need {ahead ? "this month and next" : "this month"}. If it isn&apos;t, it shows how much is short.
      </Hint>
    </span>
  );
  const body = (
    <>
      <span className={`flex items-center justify-between gap-2 text-sm font-bold leading-tight ${tone}`}>
        {text}
        {canOpen && <ChevronDown className={`size-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />}
      </span>
      <span className="block h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="presentation"><span className={`block h-full rounded-full ${bar} transition-[width] duration-500`} style={{ width: `${Math.round(value * 100)}%` }} /></span>
    </>
  );
  return (
    <div className="flex flex-col justify-center gap-1 border-t border-slate-100 px-4 py-2.5 md:border-l md:border-t-0 dark:border-slate-800" aria-label="Can I cover this month">
      {label}
      {!anyTargets ? (
        <p className="text-xs text-slate-600 dark:text-slate-300">Add a monthly cost or goal.</p>
      ) : canOpen ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 w-full flex-col justify-center gap-1.5 text-left">{body}</button>
      ) : <div className="flex flex-col gap-1.5">{body}</div>}
      {children}
      {open && canOpen && (
        <div className="mt-1 space-y-2 border-t border-[#E2E8F0] pt-2 dark:border-slate-800">
          <p className="nums text-xs text-slate-600 dark:text-slate-300">
            {formatCents(stillCents)} still to assign · {formatCents(Math.max(0, rtaCents))} ready{shortfallCents > 0 ? ` · ${formatCents(shortfallCents)} to find` : ""}
          </p>
          <ul className="divide-y divide-[#EEF2F7] dark:divide-slate-800" aria-label="Where it is short">
            {items.map((i) => (
              <li key={i.id} className="flex min-h-9 items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate"><span className="font-medium">{i.name}</span> <span className="text-xs text-slate-500">{i.group}</span></span>
                <span className="nums shrink-0 font-semibold">{formatCents(i.needCents)}</span>
              </li>
            ))}
          </ul>
          {shortfallCents > 0 && <p className="text-xs text-slate-600 dark:text-slate-300">To close the gap you can assign a little less to a pocket above, move money from a pocket with room, or wait for the next deposit.</p>}
        </div>
      )}
    </div>
  );
}
