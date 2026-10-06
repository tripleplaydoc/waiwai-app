"use client";

import { useState, useTransition } from "react";
import { Moon } from "lucide-react";
import { setQuietModeAction } from "@/app/actions/push";

/** Pause the morning reminder for a day, three days or a week. `until` is an ISO string when already paused. */
export function QuietMode({ until }: { until: string | null }) {
  const active = until && new Date(until) > new Date();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const go = (days: number) => { setMsg(null); start(async () => { const r = await setQuietModeAction(days); setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Saved." : r.error }); }); };
  return (
    <div className="mt-5 space-y-3 border-t border-[#E2E8F0] pt-4 dark:border-slate-800">
      <div className="flex items-center gap-2 text-sm font-semibold"><Moon className="size-4 text-indigo-500" aria-hidden />Quiet mode</div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {active ? `Reminders are resting until ${new Date(until!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Nothing is lost; they pick up afterwards.` : "Need a breather? Pause the morning note for a while."}
      </p>
      <div className="flex flex-wrap gap-2">
        {([[1, "1 day"], [3, "3 days"], [7, "1 week"]] as const).map(([d, label]) => (
          <button key={d} type="button" disabled={pending} onClick={() => go(d)} className="btn">{label}</button>
        ))}
        {active && <button type="button" disabled={pending} onClick={() => go(0)} className="btn btn-primary">Resume</button>}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-pos" : "text-neg"}`}>{msg.text}</p>}
    </div>
  );
}
