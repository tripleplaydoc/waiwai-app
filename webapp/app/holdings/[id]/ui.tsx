"use client";

import { useEffect, useState } from "react";
import type { ActionResult } from "@/app/actions/types";

export function Section({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden" aria-label={title}>
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-950/40">
        <h2 className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{title}</h2>
        {action}
      </div>
      {hint && <p className="px-4 pt-3 text-xs text-slate-500">{hint}</p>}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Success / error line for a form's last result. */
export function Msg({ state }: { state: ActionResult | undefined }) {
  if (!state) return null;
  return state.ok
    ? state.message ? <p role="status" className="text-sm text-pos">{state.message}</p> : null
    : <p role="alert" className="text-sm text-[#C9372C]">{state.error}</p>;
}

/** "5 min ago", rendered after load so server and phone clocks/time zones can't disagree. */
export function TimeAgo({ iso, prefix = "" }: { iso: string | null; prefix?: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!iso) return;
    const calc = () => {
      const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
      setText(mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} hr ago` : `${Math.round(mins / 1440)} days ago`);
    };
    calc();
    const t = setInterval(calc, 30000);
    return () => clearInterval(t);
  }, [iso]);
  if (!iso) return <>never</>;
  return <>{prefix}{text}</>;
}
