import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { getBudgetSummary } from "@/lib/budget/summary";
import { startOfMonthUTC } from "@/lib/budget/dates";
import { loadLeaks } from "@/lib/coach/leaks";
import { buildPnl } from "@/lib/reports/pnl";
import { runwayDays, savingsRatePct } from "@/lib/coach/growth-math";
import { pickLesson } from "@/lib/coach/lessons";
import { formatCents } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/dates";
import { Checklist } from "./checklist";

export const dynamic = "force-dynamic";
const shift = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00.000Z`) + d * 86400000).toISOString().slice(0, 10);
const mondayOf = (iso: string) => { const d = new Date(`${iso}T00:00:00.000Z`); return shift(iso, -((d.getUTCDay() + 6) % 7)); };

export default async function MeetingPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";
  const today = todayIso();
  const from = shift(today, -89);
  const [sum, uncategorized, leaks, pnl, cashRows] = await Promise.all([
    getBudgetSummary(ws.id, startOfMonthUTC(new Date(`${today}T00:00:00.000Z`))),
    prisma.transaction.count({ where: { workspaceId: ws.id, categoryId: null, splits: { none: {} }, transferAccountId: null } }),
    loadLeaks(ws.id, today).catch(() => null),
    buildPnl(ws.id, { from, to: today, prevFrom: shift(from, -90), prevTo: shift(from, -1) }),
    prisma.account.aggregate({ where: { workspaceId: ws.id, onBudget: true, type: { in: ["CHECKING", "SAVINGS"] } }, _sum: { openingBalanceCents: true } }).catch(() => null),
  ]);
  const over = sum.rows.filter((r) => r.type === "EXPENSE" && r.availableCents < 0);
  const rate = savingsRatePct(pnl.revenueCents, pnl.expenseCents);
  const cash = cashRows?._sum.openingBalanceCents ?? 0;
  const runway = runwayDays(Math.max(0, cash), pnl.expenseCents, 90);
  const creeping = leaks?.report.creeping.length ?? 0;
  const lesson = pickLesson({ rtaCents: sum.readyToAssignCents, overspent: over.length, review: uncategorized, creeping, subs: leaks?.report.recurring.filter((r) => r.subscriptionLike && r.active).length ?? 0, runway: null, rate });
  const week = mondayOf(today);
  const steps = [
    sum.readyToAssignCents > 0 ? `Assign the ${formatCents(sum.readyToAssignCents)} in Ready to Assign` : "Ready to Assign is at zero",
    over.length ? `Cover ${over.length} overspent pocket${over.length > 1 ? "s" : ""}` : "No overspent pockets",
    uncategorized ? `Give ${uncategorized} transaction${uncategorized > 1 ? "s" : ""} a pocket` : "Every transaction has a pocket",
    "Check each account against your bank (Balance check)",
    "Make one decision for the week (below)",
  ];
  const card = "card p-5";
  const h = "text-base font-bold tracking-tight";
  return (
    <div className="space-y-5">
      <Link href={`/coach${q}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300"><ArrowLeft className="size-4" aria-hidden /> Coach</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Money Meeting</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Ten minutes, once a week, for {ws.name}. You steward the money, so you review it.</p>
      </div>
      <section className={card} aria-labelledby="m1">
        <h2 id="m1" className={h}>This week&apos;s checklist</h2>
        <Checklist week={week} items={steps} />
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
          <Link className="flex min-h-11 items-center rounded-xl border border-[#E2E8F0] px-4 dark:border-slate-700" href={`/budget${q}`}>Budget</Link>
          <Link className="flex min-h-11 items-center rounded-xl border border-[#E2E8F0] px-4 dark:border-slate-700" href={`/accounts${q}`}>Accounts</Link>
          <Link className="flex min-h-11 items-center rounded-xl border border-[#E2E8F0] px-4 dark:border-slate-700" href={`/accounts/check${q}`}>Balance check</Link>
        </div>
      </section>
      {over.length > 0 && (
        <section className={card} aria-labelledby="m2">
          <h2 id="m2" className={h}>Overspent</h2>
          <ul className="mt-2 text-sm">{over.slice(0, 6).map((r) => <li key={r.id} className="flex justify-between py-1"><span>{r.name}</span><span className="nums font-semibold text-neg">{formatCents(r.availableCents)}</span></li>)}</ul>
        </section>
      )}
      {leaks && (leaks.report.creeping.length > 0 || leaks.report.doubles.length > 0) && (
        <section className={card} aria-labelledby="m3">
          <h2 id="m3" className={h}>Possible leaks</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{leaks.report.creeping.length} price increase{leaks.report.creeping.length === 1 ? "" : "s"} and {leaks.report.doubles.length} possible double charge{leaks.report.doubles.length === 1 ? "" : "s"}. <Link className="font-semibold underline" href={`/coach/leaks${q}`}>Open the Leak finder</Link>.</p>
        </section>
      )}
      <section className={card} aria-labelledby="m4">
        <h2 id="m4" className={h}>Lesson: {lesson.title}</h2>
        <p className="mt-2 text-sm">{lesson.body}</p>
        <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm font-semibold dark:bg-slate-800">Decision for this week: {lesson.action}</p>
        {runway !== null && <p className="mt-2 text-xs text-slate-500">Cash runway about {runway} days.</p>}
      </section>
    </div>
  );
}
