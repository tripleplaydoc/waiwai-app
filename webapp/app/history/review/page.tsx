import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { getSealedThrough, historyReady } from "@/lib/history";
import { dateToIso } from "@/lib/utils/dates";
import { groupForReview, reviewTotals } from "@/lib/history-review";
import { ReviewClient } from "./review-client";

export const dynamic = "force-dynamic";

export default async function HistoryReviewPage({ searchParams }: { searchParams: Promise<{ ws?: string; year?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const wsKey = wsKeyFromParam(sp.ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";
  const back = <Link href={`/history${q}`} className="text-sm font-semibold text-blue-700 dark:text-blue-300">← History</Link>;
  if (!(await historyReady())) return <div className="space-y-3">{back}<div className="card p-5 text-sm">Run the History migration first.</div></div>;

  const years = (await prisma.$queryRaw<{ y: number }[]>`select distinct extract(year from "date")::int as y from "historical_transactions" where "workspaceId" = ${ws.id} order by y desc`).map((r) => r.y);
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : years[0];
  if (!year) return <div className="space-y-3">{back}<div className="card p-5 text-sm">Import some past years first, then come back to go through them.</div></div>;

  const [rows, sealed, accounts] = await Promise.all([
    prisma.historicalTransaction.findMany({ where: { workspaceId: ws.id, date: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lte: new Date(`${year}-12-31T00:00:00.000Z`) } }, orderBy: [{ date: "desc" }, { id: "asc" }] }),
    getSealedThrough(ws.id),
    prisma.account.findMany({ where: { workspaceId: ws.id }, select: { id: true, name: true } }),
  ]);
  let reviewedAt: string | null = null;
  try { const r = await prisma.historyReview.findUnique({ where: { workspaceId_year: { workspaceId: ws.id, year } } }); reviewedAt = r ? r.reviewedAt.toISOString().slice(0, 10) : null; } catch { /* table not created yet */ }
  const name = new Map(accounts.map((a) => [a.id, a.name]));
  const vm = rows.map((r) => ({ id: r.id, date: dateToIso(r.date), amountCents: r.amountCents, payee: r.payee, memo: r.memo, account: name.get(r.accountId) ?? "", kind: r.kind, typeKey: r.typeKey }));
  return (
    <div className="space-y-4">
      {back}
      <h1 className="text-2xl font-semibold tracking-tight">Review {year}</h1>
      <ReviewClient workspaceId={ws.id} isBusiness={ws.type === "BUSINESS"} year={year} years={years} wsQuery={q} sealed={sealed !== null && year <= sealed}
        reviewedAt={reviewedAt} groups={groupForReview(vm)} totals={reviewTotals(vm)} />
    </div>
  );
}
