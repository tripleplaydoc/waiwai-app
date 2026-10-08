"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setBudgetViewAction } from "@/app/actions/budget-view";
import type { BudgetMode, Horizon } from "@/lib/budget/horizon";

function Seg<T extends string>({ label, value, options, onPick, disabled }: { label: string; value: T; options: { v: T; text: string }[]; onPick: (v: T) => void; disabled: boolean }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-slate-100 p-0.5 dark:bg-slate-800">
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} disabled={disabled} onClick={() => value !== o.v && onPick(o.v)}
          className={`relative min-h-7 rounded-full px-2.5 text-[11px] font-semibold leading-none before:absolute before:-inset-y-2 before:-inset-x-0.5 ${value === o.v ? "bg-white text-[#4F46E5] shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"}`}>{o.text}</button>
      ))}
    </div>
  );
}

/** Simple / Advanced, and This month / Next month too. */
export function ViewToggle({ mode, horizon }: { mode: BudgetMode; horizon: Horizon }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (v: { mode?: string; horizon?: string }) => start(async () => { await setBudgetViewAction(v); router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Seg label="Detail" value={mode} disabled={pending} onPick={(v) => set({ mode: v })} options={[{ v: "simple", text: "Simple" }, { v: "advanced", text: "Advanced" }]} />
      <Seg label="How far ahead" value={horizon} disabled={pending} onPick={(v) => set({ horizon: v })} options={[{ v: "now", text: "This month" }, { v: "ahead", text: "+ Next month" }]} />
    </div>
  );
}
