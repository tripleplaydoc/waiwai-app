import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Sprout, Target } from "lucide-react";
import { formatCents } from "@/lib/utils/currency";
import { CountUp } from "@/components/count-up";
import { Hint } from "@/components/hint";
import { Sparkline } from "@/components/sparkline";
import { shortDay } from "@/lib/home-math";
import type { Goal, Recent } from "@/lib/home-extras";
import { generationsCaption, generationsTotals } from "@/lib/generations";

/** Simplified Home for a private (kid) budget: one big spendable number, friendly goals, recent activity. */
export function KidHome({ greeting, cashCents, setAsideCents, spendableCents, goals, gifts = [], recent, trend, q }: {
  greeting: string; cashCents: number; setAsideCents: number; spendableCents: number | null; goals: Goal[]; gifts?: Goal[]; recent: Recent[]; trend: number[]; q: string;
}) {
  const marked = spendableCents !== null;
  const spendable = marked ? spendableCents : Math.max(0, cashCents - setAsideCents);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{greeting}</h1>

      <section className="card p-5 text-center sm:p-6" aria-label="You can spend">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">You can spend <Hint>{marked ? "This adds up the money in your spending pockets. A parent can choose which pockets count." : "This is the cash you have, minus the money you've set aside for your goals. Your goal money stays safe until you reach the goal."}</Hint></div>
        <div className="nums mt-1 text-5xl font-bold tracking-tight text-pos sm:text-6xl"><CountUp cents={spendable} /></div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {marked ? <>This is the money in your spending pockets.</> : setAsideCents > 0 ? <>You have {formatCents(cashCents)} in total, and {formatCents(setAsideCents)} is set aside for your goals.</> : <>That&apos;s all the cash you have right now.</>}
        </p>
        {trend.length > 1 && <div className="mx-auto mt-3 max-w-xs"><Sparkline values={trend} color="#2E7D32" label="Your cash over the last 30 days" /><div className="text-[11px] text-slate-500">Your cash, last 30 days</div></div>}
      </section>

      <section aria-label="Your goals">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold"><Target className="size-4 text-water" aria-hidden />Your goals</h2>
        {goals.length === 0 ? (
          <div className="card p-4 text-sm text-slate-600 dark:text-slate-300">
            No goals yet. A goal is something you&apos;re saving up for. <Link href={`/budget${q}`} className="font-semibold text-[#2E6BE6] dark:text-indigo-300">Set one up in your pockets</Link>.
          </div>
        ) : (
          <ul className="space-y-3">
            {goals.map((g) => (
              <li key={g.id} className="card p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold">{g.name}</span>
                  <span className="nums shrink-0 text-sm text-slate-600 dark:text-slate-300"><span className="font-semibold text-slate-900 dark:text-slate-100">{formatCents(g.savedCents)}</span> of {formatCents(g.targetCents)}</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.fraction * 100)} aria-label={`${g.name} progress`}>
                  <div className={`bar-grow h-full rounded-full ${g.reached ? "bg-pos" : "bg-water"}`} style={{ width: `${Math.max(g.fraction > 0 ? 3 : 0, g.fraction * 100)}%` }} />
                </div>
                <div className="mt-1 text-xs text-slate-500">{g.reached ? "You did it!" : `${formatCents(g.targetCents - g.savedCents)} to go`}{g.byDate && !g.reached ? ` · by ${shortDay(g.byDate)}` : ""}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {gifts.length > 0 && (
        <section aria-label="A gift for your future">
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold"><Sprout className="size-4 text-pos" aria-hidden />A gift for your future <Hint>Money you are saving for the grown-up you will be someday. It is for the long run, so it is not part of what you can spend.</Hint></h2>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">{generationsCaption(generationsTotals(gifts.map((g) => ({ id: g.id, name: g.name, savedCents: g.savedCents, targetCents: g.targetCents > 0 ? g.targetCents : null }))), true)}</p>
          <ul className="space-y-3">
            {gifts.map((g) => (
              <li key={g.id} className="card p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold">{g.name}</span>
                  <span className="nums shrink-0 text-sm text-slate-600 dark:text-slate-300"><span className="font-semibold text-slate-900 dark:text-slate-100">{formatCents(g.savedCents)}</span>{g.targetCents > 0 && <> of {formatCents(g.targetCents)}</>}</span>
                </div>
                {g.targetCents > 0 && (
                  <>
                    <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.fraction * 100)} aria-label={`${g.name} progress`}>
                      <div className={`bar-grow h-full rounded-full ${g.reached ? "bg-pos" : "bg-water"}`} style={{ width: `${Math.max(g.fraction > 0 ? 3 : 0, g.fraction * 100)}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{g.reached ? "You did it!" : `${formatCents(g.targetCents - g.savedCents)} to go`}</div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Recent activity">
        <h2 className="mb-1 text-base font-bold">Recent activity</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Nothing yet. Tap the + button to add what you spend or receive.</p>
        ) : (
          <ul className="card divide-y divide-[#EEF2F7] px-4 dark:divide-slate-800">
            {recent.map((t) => (
              <li key={t.id} className="flex min-h-12 items-center gap-3 text-sm">
                {t.cents > 0 ? <ArrowDownLeft className="size-4 shrink-0 text-pos" aria-label="money in" /> : <ArrowUpRight className="size-4 shrink-0 text-slate-400" aria-label="money out" />}
                <span className="min-w-0 flex-1 truncate">{t.label}</span>
                <span className="text-xs text-slate-500">{shortDay(t.date)}</span>
                <span className={`nums shrink-0 font-semibold ${t.cents > 0 ? "text-pos" : ""}`}>{t.cents > 0 ? "+" : "−"}{formatCents(Math.abs(t.cents))}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/accounts${q}`} className="mt-1 flex min-h-11 items-center gap-1 text-sm font-semibold text-[#2E6BE6] dark:text-indigo-300">See all accounts <ArrowRight className="size-4" aria-hidden /></Link>
      </section>
      <Link href={`/help${q}`} className="mx-auto flex min-h-11 items-center justify-center text-sm font-medium text-slate-500">How WaiWai works</Link>
    </div>
  );
}
