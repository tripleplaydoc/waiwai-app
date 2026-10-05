"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BillBadge, MarkPaidButton } from "./bill-controls";
import type { BillState, BillStatus } from "@/lib/budget/bills";
import { shortDate } from "@/lib/budget/bills";
import { formatCents } from "@/lib/utils/currency";

export interface CalItem {
  id: string;
  kind: "pocket" | "card";
  name: string;
  dueIso: string;
  amountCents: number;
  status: BillStatus;
  manualPaid: boolean;
  /** Cards link to their page. */
  href?: string;
}

const DOT: Record<BillState, string> = { paid: "bg-pos", overdue: "bg-neg", due_soon: "bg-warn", upcoming: "bg-slate-400 dark:bg-slate-500" };
const TINT: Record<BillState, string> = {
  paid: "bg-pos-soft", overdue: "bg-neg-soft", due_soon: "bg-warn-soft", upcoming: "bg-slate-100 dark:bg-slate-800",
};
const RANK: Record<BillState, number> = { overdue: 3, due_soon: 2, upcoming: 1, paid: 0 };
const LABEL: Record<BillState, string> = { paid: "Paid", due_soon: "Due soon", overdue: "Overdue", upcoming: "Upcoming" };

/** A month grid of when bills are due. Colour = status; tap a day to see (and mark paid) its bills. */
export function BillsCalendar({ workspaceId, monthIso, todayIso, items }: { workspaceId: string; monthIso: string; todayIso: string; items: CalItem[] }) {
  const [y, m] = monthIso.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const title = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const byDay = useMemo(() => {
    const map = new Map<number, CalItem[]>();
    for (const it of items) {
      const d = Number(it.dueIso.slice(8, 10));
      map.set(d, [...(map.get(d) ?? []), it]);
    }
    return map;
  }, [items]);

  // Start on the first day that still needs attention, otherwise the first bill day.
  const initial = useMemo(() => {
    const open = items.filter((i) => i.status.state !== "paid").sort((a, b) => a.dueIso.localeCompare(b.dueIso))[0];
    const any = [...items].sort((a, b) => a.dueIso.localeCompare(b.dueIso))[0];
    const pick = open ?? any;
    return pick ? Number(pick.dueIso.slice(8, 10)) : null;
  }, [items]);
  const [sel, setSel] = useState<number | null>(initial);

  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const todayDay = todayIso.startsWith(monthIso) ? Number(todayIso.slice(8, 10)) : null;
  const picked = sel ? byDay.get(sel) ?? [] : [];

  return (
    <div>
      <p className="mb-1.5 text-center text-sm font-bold text-slate-800 dark:text-slate-100">{title}</p>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`Bills due in ${title}`}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500" role="columnheader">{d}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} aria-hidden />;
          const list = byDay.get(d);
          const worst = list ? list.reduce<BillState>((w, it) => (RANK[it.status.state] > RANK[w] ? it.status.state : w), "paid") : null;
          const isToday = d === todayDay;
          const isSel = d === sel;
          const base = "relative flex min-h-11 flex-col items-center justify-center rounded-xl text-sm nums";
          if (!list) {
            return <div key={d} role="gridcell" className={`${base} ${isToday ? "border border-[#2E6BE6] font-bold text-[#2E6BE6]" : "text-slate-500"}`}>{d}</div>;
          }
          return (
            <button
              key={d} type="button" role="gridcell" onClick={() => setSel(d)} aria-pressed={isSel}
              aria-label={`${shortDate(`${monthIso}-${String(d).padStart(2, "0")}`)}: ${list.length} ${list.length === 1 ? "bill" : "bills"}, ${LABEL[worst!].toLowerCase()}`}
              className={`${base} ${TINT[worst!]} font-bold text-slate-800 dark:text-slate-100 ${isSel ? "ring-2 ring-[#2E6BE6]" : isToday ? "ring-1 ring-[#2E6BE6]" : ""}`}
            >
              {d}
              <span className="mt-0.5 flex gap-0.5" aria-hidden>
                {list.slice(0, 3).map((it) => <span key={it.id} className={`size-1.5 rounded-full ${DOT[it.status.state]}`} />)}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300" aria-label="Colour key">
        {(["paid", "due_soon", "overdue", "upcoming"] as BillState[]).map((s) => (
          <li key={s} className="flex items-center gap-1"><span className={`size-2 rounded-full ${DOT[s]}`} aria-hidden />{LABEL[s]}</li>
        ))}
      </ul>

      <div className="mt-2 border-t border-[#E2E8F0] pt-2 dark:border-slate-800" aria-live="polite">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No bills this month. Add a <strong>due day</strong> to a pocket (tap its pencil) and it shows up here.</p>
        ) : picked.length === 0 ? (
          <p className="text-sm text-slate-500">Tap a coloured day to see its bills.</p>
        ) : (
          <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
            {picked.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                <div className="flex min-w-0 flex-1 basis-32 flex-col">
                  <span className="break-words text-sm font-semibold">{it.name}{it.kind === "card" && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">Card</span>}</span>
                  <span className="nums text-xs text-slate-500">Due {shortDate(it.dueIso)}{it.amountCents > 0 ? ` · ${formatCents(it.amountCents)}${it.kind === "card" ? " owed" : ""}` : ""}</span>
                </div>
                <BillBadge status={it.status} />
                {it.kind === "pocket"
                  ? <MarkPaidButton workspaceId={workspaceId} categoryId={it.id} month={monthIso} status={it.status} manualPaid={it.manualPaid} size="md" />
                  : <Link href={it.href!} className="inline-flex min-h-9 items-center rounded-full border border-[#2E6BE6] px-3.5 text-[11px] font-semibold text-[#2E6BE6] dark:border-blue-400 dark:text-blue-300">Open card</Link>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
