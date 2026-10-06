import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import { getCurrentUser, requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { loadHome } from "@/lib/home";
import { formatCents } from "@/lib/utils/currency";
import { daysBetween } from "@/lib/forecast-math";
import { shortDay } from "@/lib/home-math";
import { postDue } from "@/lib/recurring";
import { DailyVerse } from "@/components/daily-verse";
import { parseLayout } from "@/lib/home-layout";
import { prisma } from "@/lib/prisma";
import { HomeSections } from "./home-sections";

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

  const layout = parseLayout(await loadLayout(me?.id));
  const nodes: Record<string, React.ReactNode> = {
    verse: <DailyVerse />,
    cash: (
      <section className="card p-4 sm:p-5" aria-label="Cash on hand">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cash on hand</span>
          {h.gap ? (
            <Link href={`/forecast${q}`} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">Plan ahead for {shortDay(h.gap.iso)}</Link>
          ) : (
            <Link href={`/forecast${q}`} className="rounded-full bg-pos-soft px-3 py-1 text-xs font-semibold text-pos">Covered for 60 days</Link>
          )}
        </div>
        <div className="nums mt-1 text-4xl font-bold tracking-tight text-water">{formatCents(h.cashCents)}</div>
        {h.accounts.length > 0 && (
          <>
            <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Where your cash sits">
              {h.accounts.map((a, i) => <div key={a.id} className={SWATCH[i % SWATCH.length]} style={{ flex: Math.max(0, a.cents) / total || 0.001 }} />)}
            </div>
            <ul className="mt-2 divide-y divide-[#EEF2F7] dark:divide-slate-800">
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
          <ul className="mt-2 divide-y divide-[#EEF2F7] dark:divide-slate-800">
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
        <Link href={`/forecast${q}`} className="mt-1 flex min-h-11 items-center justify-between border-t border-[#EEF2F7] pt-1 text-sm font-semibold text-[#2E6BE6] dark:border-slate-800 dark:text-indigo-300">See the 60-day forecast <ArrowRight className="size-4" aria-hidden /></Link>
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
              <li key={s.key} className="flex items-center gap-3 border-t border-[#EEF2F7] px-4 py-3 first:border-t-0 dark:border-slate-800 sm:px-5">
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
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{h.greeting}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Here&apos;s how your {ws.name.toLowerCase()} money is flowing today.</p>
      </div>
      <HomeSections nodes={nodes} layout={layout} />
    </div>
  );
}
