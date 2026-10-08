import Link from "next/link";
import { ArrowRight, Check, CircleHelp } from "lucide-react";
import { startProgress, type StartStep } from "@/lib/home-start";
import { HideStart } from "./hide-start";

/** "Getting started" checklist. Shown on Home until every step is done (or the person hides it). */
export function StartCard({ steps, cookieName, q }: { steps: StartStep[]; cookieName: string; q: string }) {
  const { done, total } = startProgress(steps);
  const next = steps.find((s) => !s.done);
  return (
    <section className="card p-4 sm:p-5" aria-label="Getting started">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Let&apos;s get you set up</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Four small steps. Do them in any order; this card goes away on its own when you&apos;re done.</p>
        </div>
        <HideStart cookieName={cookieName} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Setup progress">
          <div className="bar-grow h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <span className="nums text-xs font-semibold text-slate-600 dark:text-slate-300">{done} of {total}</span>
      </div>
      <ol className="mt-2">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3 py-2.5">
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-pos text-white dark:text-slate-900" : s === next ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`} aria-hidden>
              {s.done ? <Check className="size-4" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-semibold ${s.done ? "text-slate-400 line-through dark:text-slate-500" : ""}`}>{s.title}</div>
              {!s.done && <div className="text-xs text-slate-600 dark:text-slate-300">{s.detail}</div>}
            </div>
            {!s.done && <Link href={s.href} className={`btn shrink-0 ${s === next ? "btn-primary" : ""}`}>{s.action}</Link>}
          </li>
        ))}
      </ol>
      <Link href={`/help${q}`} className="mt-1 flex min-h-11 items-center gap-2 text-sm font-semibold text-[#2E6BE6] dark:text-indigo-300"><CircleHelp className="size-4" aria-hidden /> How WaiWai works <ArrowRight className="size-4" aria-hidden /></Link>
    </section>
  );
}
