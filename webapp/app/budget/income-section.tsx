"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { PocketDialog } from "./pocket-dialog";
import { formatCents } from "@/lib/utils/currency";
import { typeLabel } from "@/lib/budget/expense-types";
import type { PocketVM } from "@/lib/budget/board-types";

export function IncomeSection({ workspaceId, isBusiness, month, rows, allGroups, customTypes }: {
  customTypes: string[];
  workspaceId: string; isBusiness: boolean; month: string; rows: PocketVM[]; allGroups: { id: string; name: string }[];
}) {
  const [dlg, setDlg] = useState<{ pocket: PocketVM | null } | null>(null);
  return (
    <section className="card overflow-hidden" aria-label="Income">
      <div className="flex items-center gap-3 bg-income px-4 py-2.5 text-white">
        <h2 className="mr-auto text-sm font-bold tracking-tight">Income</h2>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/75">Received this month</span>
        <button type="button" onClick={() => setDlg({ pocket: null })} aria-label="Add income source" className="flex size-8 items-center justify-center rounded-lg text-white hover:bg-white/15">
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 border-t border-[#E2E8F0] px-4 py-3 dark:border-slate-800">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}{typeLabel(r.expenseType) && <span className="ml-2 rounded bg-pos-soft px-1.5 py-0.5 align-middle text-[11px] font-medium text-pos">{typeLabel(r.expenseType)}</span>}</span>
          <span className="nums text-sm font-semibold text-pos">{formatCents(r.activityCents)}</span>
          <button type="button" onClick={() => setDlg({ pocket: r })} aria-label={`Edit ${r.name}`} className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <Pencil className="size-4" aria-hidden />
          </button>
        </div>
      ))}
      {dlg && (
        <PocketDialog
          customTypes={customTypes}
          open onClose={() => setDlg(null)} workspaceId={workspaceId} isBusiness={isBusiness} groups={allGroups}
          pocket={dlg.pocket ? { ...dlg.pocket } : null} monthIso={month} kindOfNew="INCOME" defaultGroupId={rows[0]?.groupId ?? undefined}
        />
      )}
    </section>
  );
}
