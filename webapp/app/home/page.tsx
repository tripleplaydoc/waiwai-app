import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import { getCurrentUser, requireAuth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getBudgetView, getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { loadHome } from "@/lib/home";
import { formatCents } from "@/lib/utils/currency";
import { daysBetween } from "@/lib/forecast-math";
import { shortDay } from "@/lib/home-math";
import { postDue } from "@/lib/recurring";
import { DailyVerse } from "@/components/daily-verse";
import { DailyOlelo } from "@/components/daily-olelo";
import { parseLayout } from "@/lib/home-layout";
import { prisma } from "@/lib/prisma";
import { HomeSections } from "./home-sections";
import { CountUp } from "@/components/count-up";
import { Hint } from "@/components/hint";
import { Sparkline } from "@/components/sparkline";
import { getReadyToAssign } from "@/lib/budget/ready-to-assign";
import { startProgress, startSteps } from "@/lib/home-start";
import { legacyPockets, loadCashTrend, loadGoals, loadRecent, loadStartCounts } from "@/lib/home-extras";
import { isoToDate, monthLabel } from "@/lib/utils/dates";
import { loadStewardship } from "@/lib/stewardship-state";
import { loadFlowNudge } from "@/lib/flow-nudge-state";
import { isSnoozed } from "@/lib/flow-nudge";
import { StewardshipCard } from "./stewardship-card";
import { GenerationsCard } from "./generations-card";
import { FlowNudgeCard } from "./flow-nudge-card";
import { StartCard } from "./start-card";
import { KidHome } from "./kid-home";

/** The saved Home layout JSON for this person (null when none or the table is not there yet). */
async function loadLayout(userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  try { return (await prisma.homeLayout.findUnique({ where: { userId } }))?.layout ?? null; } catch { return null; }
}

export const dynamic = "force-dynamic";

const SWATCH = ["bg-[#2E6BE6]", "bg-water", "bg-[#D97706]", "bg-[#7C3AED]", "bg-[#64748B]", "bg-[#DB2777]"];
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const dayNum = (iso: string) => +iso.slice(8, 10);

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const me = await getCurrentUser();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";
  await postDue(ws.id, { onlyAuto: true });
  const first = (me?.name?.trim() || "").split(/\s+/)[0] ?? "";
  const h = await loadHome(ws.id, first, { wsQ: q });
  const total = h.accounts.reduce((s, a) => s + Math.max(0, a.cents), 0) || 1;
  const today = h.forecast.today;

  const view = await getBudgetView();
  const cashIds = h.forecast.accounts.map((a) => a.id);
  const trend = await loadCashTrend(ws.id, cashIds, h.cashCents, today);

  // A private (kid) budget gets the simple layout: what you can spend, goals, recent activity.
  if (view?.privateUser) {
    const [{ goals, gifts, setAsideCents, spendableCents }, recent] = await Promise.all([loadGoals(ws.id, isoToDate(`${today.slice(0, 7)}-01`)), loadRecent(ws.id, 6)]);
    return <KidHome greeting={h.greeting} cashCents={h.cashCents} setAsideCents={setAsideCents} spendableCents={spendableCents} goals={goals} gifts={gifts} recent={recent} trend={trend} q={q} />;
  }

  const [counts, poolCents] = await Promise.all([loadStartCounts(ws.id), getReadyToAssign(prisma, ws.id, new Date())]);
  const steps = startSteps(counts, q);
  const hideName = `ww_hide_start_${ws.id}`;
  let hiddenStart = false;
  try { hiddenStart = (await cookies()).get(hideName)?.value === "1"; } catch { hiddenStart = false; }
  const showStart = !startProgress(steps).complete && !hiddenStart;

  // Personal-only cards: where this month's money went, and what is set aside for the next generation.
  const isPersonal = ws.type === "PERSONAL";
  const steward = isPersonal ? await loadStewardship(ws.id, today) : null;
  const legacy = isPersonal ? legacyPockets(h.rows) : [];
  // "Let it flow": money resting in the Pool for a week or more, unless it was snoozed ("Maybe later" keeps it quiet for 3 days).
  const nudgeCookie = `ww_nudge_${ws.id}`;
  let snoozed = false;
  try { snoozed = isSnoozed((await cookies()).get(nudgeCookie)?.value, today); } catch { snoozed = false; }
  const nudge = snoozed ? null : await loadFlowNudge(ws.id, poolCents, today);

  const layout = parseLayout(await loadLayout(me?.id));
  const nodes: Record<string, React.ReactNode> = {
    verse: <div className="space-y-2"><DailyVerse /><DailyOlelo /></div>,
    stewardship: steward ? <StewardshipCard data={steward} monthLabel={monthLabel(isoToDate(`${today.slice(0, 7)}-01`))} /> : null,
    flow: nudge ? <FlowNudgeCard amount={formatCents(nudge.cents)} days={nudge.days} today={today} cookieName={nudgeCookie} href={`/budget${q}`} /> : null,
    generations: isPersonal ? <GenerationsCard pockets={legacy} q={q} /> : null,
    cash: (
      <section className="card p-4 sm:p-5" aria-label="Cash on hand">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cash on hand <Hint>All the money sitting in your checking, savings and cash accounts right now. It is what you have, not what is already promised to a pocket.</Hint></span>
          {h.gap ? (
            <Link href={`/forecast${q}`} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">Plan ahead for {shortDay(h.gap.iso)}</Link>
          ) : (
            <Link href={`/forecast${q}`} className="rounded-full bg-pos-soft px-3 py-1 text-xs font-semibold text-pos">Covered for 60 days</Link>
          )}
        </div>
        <div className="nums mt-1 text-4xl font-bold tracking-tight text-water"><CountUp cents={h.cashCents} /></div>
        {trend.length > 1 && (
          <div className="mt-2">
            <Sparkline values={trend} color="#0E7C86" label="Cash on hand over the last 30 days" />
            <div className="mt-0.5 flex justify-between text-[11px] text-slate-500"><span>30 days ago</span><span>Today</span></div>
          </div>
        )}
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 text-sm dark:bg-slate-800/60">
          <span className="text-slate-600 dark:text-slate-300">In the pool <Hint>The pool (&quot;Ready to assign&quot;) is money that has arrived but doesn&apos;t have a job yet. Move it into pockets on the Budget page.</Hint></span>
          <Link href={`/budget${q}`} className={`nums font-semibold ${poolCents < 0 ? "text-neg" : poolCents > 0 ? "text-pos" : ""}`}>{formatCents(poolCents)}</Link>
        </div>        {h.accounts.length > 0 && (
          <>
            <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Where your cash sits">
              {h.accounts.map((a, i) => <div key={a.id} className={SWATCH[i % SWATCH.length]} style={{ flex: Math.max(0, a.cents) / total || 0.001 }} />)}
            </div>
            <ul className="mt-3">
              {h.accounts.map((a, i) => (
                <li key={a.id} className="flex min-h-11 items-center gap-3 text-sm">
                  <span className={`size-2.5 shrink-0 rounded-[3px] ${SWATCH[i % SWATCH.length]}`} aria-hidden />
                  <Link href={`/accounts/${a.id}${q}`} className="min-w-0 flex-1 truncate font-medium">{a.name}{a.kind && <span className="ml-1.5 text-xs font-normal text-slate-500">· {a.kind === "cash" ? "cash in hand" : a.kind}</span>}</Link>
                  <span className="nums font-semibold">{formatCents(a.cents)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

    ),
    wins: (
      <section className="card p-4 sm:p-5" aria-label="What's going well">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold"><Sparkles className="size-4 text-water" aria-hidden />What&apos;s going well</h2>
        <ul className="space-y-2">
          {h.wins.map((w) => (
            <li key={w.key} className="flex items-start gap-2.5 text-sm">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-pos" aria-hidden />
              <span>{w.text}</span>
            </li>
          ))}
        </ul>
      </section>

    ),
    ahead: (
      <section className="card p-4 sm:p-5" aria-label="Looking ahead">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-bold">Looking ahead: 7 days</h2>
          <span className="nums text-xs text-slate-500">In {formatCents(h.coming.inCents)} · Out {formatCents(h.coming.outCents)}</span>
        </div>
        {h.coming.inEvents.length + h.coming.outEvents.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">A quiet week. Nothing is scheduled to move.</p>
        ) : (
          <ul className="mt-2">
            {[...h.coming.inEvents, ...h.coming.outEvents].map((e, i) => (
              <li key={`${e.id}-${i}`} className="flex min-h-12 items-center gap-3">
                <div className="w-11 shrink-0 text-center leading-tight"><div className="text-[11px] font-semibold uppercase text-slate-500">{weekday(e.date)}</div><div className="text-lg font-bold">{dayNum(e.date)}</div></div>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                  {e.cents > 0 ? <ArrowDownLeft className="size-4 shrink-0 text-pos" aria-label="coming in" /> : <ArrowUpRight className="size-4 shrink-0 text-slate-400" aria-label="going out" />}
                  <span className="truncate">{e.label}</span>
                </span>
                <span className={`nums shrink-0 text-sm font-semibold ${e.cents > 0 ? "text-pos" : ""}`}>{e.cents > 0 ? "+" : "−"}{formatCents(Math.abs(e.cents))}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/forecast${q}`} className="mt-1 flex min-h-11 items-center justify-between pt-1 text-sm font-semibold text-[#2E6BE6] dark:border-slate-800 dark:text-indigo-300">See the 60-day forecast <ArrowRight className="size-4" aria-hidden /></Link>
      </section>

    ),
    steps: (
      <section className="card overflow-hidden" aria-label="Your next steps">
        <h2 className="px-4 pb-1 pt-4 text-base font-bold sm:px-5">Your next steps</h2>
        {h.steps.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-slate-600 dark:text-slate-300 sm:px-5">Nothing needs you right now. Enjoy it.</p>
        ) : (
          <ul>
            {h.steps.map((s) => (
              <li key={s.key} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="size-2 shrink-0 rounded-full bg-indigo-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{s.title}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">{s.detail}</div>
                </div>
                <Link href={s.href} className="btn shrink-0">{s.action}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

    ),
    prepare: (
      <Link href={`/prepare${q}`} className="card flex min-h-14 items-center justify-between px-5 text-sm font-semibold"><span>Prepare for more <span className="font-normal text-slate-500">· see what extra income could do</span></span> <ArrowRight className="size-4 text-slate-500" aria-hidden /></Link>
    ),
    budget: (
      <Link href={`/budget${q}`} className="card flex min-h-14 items-center justify-between px-5 text-sm font-semibold">Open the budget board <ArrowRight className="size-4 text-slate-500" aria-hidden /></Link>    ),
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{h.greeting}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Here&apos;s how your {ws.name.toLowerCase()} money is flowing today.</p>
      </div>
      {showStart && <StartCard steps={steps} cookieName={hideName} q={q} />}
      <HomeSections nodes={nodes} layout={layout} />
    </div>
  );
}
