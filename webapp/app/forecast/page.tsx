import Link from "next/link";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, CalendarClock, Landmark, Repeat, Receipt, CreditCard } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { loadForecast, FORECAST_DAYS } from "@/lib/forecast";
import { postDue } from "@/lib/recurring";
import { formatCents } from "@/lib/utils/currency";
import { daysBetween } from "@/lib/forecast-math";
import { inDays, shortDate } from "@/lib/cycle";
import { ForecastChart } from "@/components/forecast-chart";
import type { EventKind } from "@/lib/forecast-math";

export const dynamic = "force-dynamic";

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const KIND: Record<EventKind, { label: string; icon: typeof Repeat }> = {
  income: { label: "Money in", icon: ArrowDownRight },
  recurring: { label: "Repeating", icon: Repeat },
  card: { label: "Credit card", icon: CreditCard },
  loan: { label: "Loan", icon: Landmark },
  bill: { label: "Recurring flow", icon: Receipt },
  scheduled: { label: "Dated", icon: CalendarClock },
};

export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";
  await postDue(ws.id, { onlyAuto: true });
  const f = await loadForecast(ws.id, { wsQ: q });
  const withEvents = f.days.filter((d) => d.events.length > 0);
  const lowIdx = f.days.findIndex((d) => d.date === f.low.date);
  const short = f.firstShort;
  return (
    <div className="space-y-5">
      <Link href={`/accounts${q}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300"><ArrowLeft className="size-4" aria-hidden /> Accounts</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{ws.name} cash forecast</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">The next {FORECAST_DAYS} days of money in and out, from what is already known: repeating items, recurring flows, loan payments and card payments.</p>
      </div>

      {short ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100" role="status">
          <p className="font-semibold">A {formatCents(-f.low.cents)} gap to plan for around {shortDate(f.low.date)}. You have {daysBetween(f.today, short.date)} day{daysBetween(f.today, short.date) === 1 ? "" : "s"} to arrange it.</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide opacity-80">Ways to close it</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px]">
            <li>Move some from savings before then.</li>
            <li>Shift a payment to a later date, or pay a card in two parts.</li>
            <li>Assign a little less elsewhere this month.</li>
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-300 bg-pos-soft px-4 py-3 text-sm font-medium text-pos dark:border-emerald-800" role="status">
          Good news: everything known is covered. The lowest point is {formatCents(f.low.cents)} on {shortDate(f.low.date)}.
        </div>
      )}

      <section className="grid grid-cols-3 gap-3" aria-label="Forecast totals">
        <div className="card p-3 sm:p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cash today</p><p className="nums mt-1 text-base font-bold sm:text-xl">{formatCents(f.startCents)}</p></div>
        <div className="card p-3 sm:p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lowest</p><p className={`nums mt-1 text-base font-bold sm:text-xl ${f.low.cents < 0 ? "text-warn" : ""}`}>{formatCents(f.low.cents)}</p><p className="text-[11px] text-slate-500">{shortDate(f.low.date)}</p></div>
        <div className="card p-3 sm:p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">In {FORECAST_DAYS} days</p><p className={`nums mt-1 text-base font-bold sm:text-xl ${f.endCents < 0 ? "text-warn" : ""}`}>{formatCents(f.endCents)}</p><p className="text-[11px] text-slate-500">{shortDate(f.end)}</p></div>
      </section>

      <section className="card p-4" aria-label="Balance over time">
        <ForecastChart points={f.days.map((d) => d.balanceCents)} lowIndex={lowIdx < 0 ? 0 : lowIdx} label={`Cash balance from ${shortDate(f.today)} to ${shortDate(f.end)}`} />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500"><span>{shortDate(f.today)}</span><span>{shortDate(f.end)}</span></div>
        <p className="nums mt-2 text-xs text-slate-600 dark:text-slate-300">
          <ArrowUpRight className="mr-0.5 inline size-3.5 text-pos" aria-hidden />In {formatCents(f.inCents)} · <ArrowDownRight className="mr-0.5 inline size-3.5 text-slate-400" aria-hidden />Out {formatCents(f.outCents)}
        </p>
      </section>

      {!f.hasIncome && (
        <Link href={`/recurring${q}`} className="block rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs font-medium text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
          No money coming in is set up, so this only shows what goes out. Add your paycheck under Recurring and it will appear here.
        </Link>
      )}

      <section aria-label="Coming up">
        <h2 className="mb-2 text-base font-semibold">Coming up</h2>
        {withEvents.length === 0 ? (
          <p className="card p-4 text-sm text-slate-600 dark:text-slate-300">Nothing is scheduled in the next {FORECAST_DAYS} days. Set up repeating flows and deposits under <Link className="font-medium text-[#2E6BE6] underline dark:text-indigo-300" href={`/recurring${q}`}>Recurring</Link>, and give each credit card its statement and due days.</p>
        ) : (
          <ul className="card divide-y divide-[#E2E8F0] dark:divide-slate-800">
            {withEvents.map((d) => (
              <li key={d.date} className="px-4 py-3">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold">{weekday(d.date)}, {shortDate(d.date)}<span className="ml-2 text-xs font-normal text-slate-500">{d.date === f.today ? "today" : inDays(daysBetween(f.today, d.date))}</span></span>
                  <span className={`nums text-xs font-semibold ${d.balanceCents < 0 ? "text-warn" : "text-slate-500"}`} title="Balance at the end of the day">{formatCents(d.balanceCents)}</span>
                </div>
                <ul className="space-y-1.5">
                  {d.events.map((e, i) => {
                    const K = KIND[e.kind];
                    const body = (
                      <span className="flex min-h-9 items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2"><K.icon className="size-4 shrink-0 text-slate-400" aria-hidden /><span className="min-w-0"><span className="block truncate text-sm">{e.label}</span>{e.detail && <span className="block truncate text-[11px] text-slate-500">{e.detail}</span>}</span></span>
                        <span className={`nums shrink-0 text-sm font-semibold ${e.cents > 0 ? "text-pos" : ""}`}>{e.cents > 0 ? "+" : "−"}{formatCents(Math.abs(e.cents))}</span>
                      </span>
                    );
                    return <li key={`${e.id}-${i}`}>{e.href ? <Link href={e.href} className="block rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60">{body}</Link> : body}</li>;
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Counted: {f.accounts.length === 0 ? "no accounts yet" : f.accounts.map((a) => `${a.name} ${formatCents(a.cents)}`).join(", ")}. Credit cards are paid the way the card plan says: down before the statement closes, the rest by the due date.
        Everyday spending that isn&apos;t set up as repeating isn&apos;t predicted, so treat this as the floor of what you&apos;ll need, not a promise.
      </p>
    </div>
  );
}
