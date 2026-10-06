"use client";

import { useState, useTransition } from "react";
import { Check, CircleAlert, Clock } from "lucide-react";
import { setPaidAction } from "@/app/actions/pockets";
import { describeBill, type BillStatus } from "@/lib/budget/bills";

const TONE: Record<BillStatus["state"], string> = {
  paid: "bg-pos-soft text-pos",
  overdue: "bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200",
  due_soon: "bg-warn-soft text-warn",
  upcoming: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function BillBadge({ status }: { status: BillStatus }) {
  const Icon = status.state === "paid" ? Check : status.state === "overdue" ? Clock : Clock;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[status.state]}`}>
      <Icon className="size-3" aria-hidden /> {describeBill(status)}
    </span>
  );
}

/** One-tap "Mark paid" / "Undo". Bills paid through a transaction show as paid on their own. */
export function MarkPaidButton({ workspaceId, categoryId, month, status, manualPaid, size = "sm" }: {
  workspaceId: string; categoryId: string; month: string; status: BillStatus; manualPaid: boolean; size?: "sm" | "md";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  if (status.state === "paid" && !manualPaid) return null; // paid by a recorded transaction
  const paid = status.state === "paid";
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          const r = await setPaidAction(workspaceId, categoryId, month, !paid);
          setError(r.ok ? undefined : r.error);
        })}
        className={`inline-flex items-center justify-center gap-1 rounded-full border text-[11px] font-semibold transition-colors disabled:opacity-60 ${
          size === "md" ? "min-h-9 px-3.5" : "min-h-7 px-2.5"
        } ${paid
          ? "border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          : "border-[#2E6BE6] text-[#2E6BE6] hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950/50"}`}
      >
        {paid ? "Undo" : <><Check className="size-3" aria-hidden /> Mark paid</>}
      </button>
      {error && <span role="alert" className="text-[11px] text-neg">{error}</span>}
    </>
  );
}
