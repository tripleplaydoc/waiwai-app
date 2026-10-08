import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { dateToIso } from "@/lib/utils/dates";
import { getSealedThrough, historyReady, loadHistory } from "@/lib/history";
import { taxRateBps } from "@/lib/reports/pnl";
import { HistoryClient } from "./history-client";
import type { AttentionRow } from "./needs-attention";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const wsKey = wsKeyFromParam(sp.ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";

  if (!(await historyReady())) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <div className="card space-y-2 p-5 text-sm">
          <p className="font-semibold">One setup step is needed.</p>
          <p>The History tables have not been created in your database yet. Run the migration <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">20261005280000_history_layer</code> in the Supabase SQL Editor, then reload this page.</p>
        </div>
      </div>
    );
  }
  const todo = { workspaceId: ws.id, typeKey: null, kind: { not: "TRANSFER" } };
  const [vm, bps, todoCount, todoRows, sealed, accts] = await Promise.all([
    loadHistory(ws.id, ws.type === "BUSINESS"), taxRateBps(ws.id),
    prisma.historicalTransaction.count({ where: todo }),
    prisma.historicalTransaction.findMany({ where: todo, orderBy: [{ date: "desc" }, { id: "asc" }], take: 40 }),
    getSealedThrough(ws.id),
    prisma.account.findMany({ where: { workspaceId: ws.id }, select: { id: true, name: true } }),
  ]);
  const accName = new Map(accts.map((a) => [a.id, a.name]));
  const attention: AttentionRow[] = todoRows.map((r) => ({ id: r.id, date: dateToIso(r.date), amountCents: r.amountCents, payee: r.payee, memo: r.memo, account: accName.get(r.accountId) ?? "", sealed: sealed !== null && r.date.getUTCFullYear() <= sealed }));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ws.name} history</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">Past years, kept apart from your live budget. Nothing here changes a balance, Ready to Assign or a pocket.</p>
        </div>
        <Link href={`/history/import${q}`} className="btn btn-primary ml-auto min-h-11">Import past years</Link>
      </div>
      <HistoryClient vm={vm} attention={attention} attentionCount={todoCount} workspaceId={ws.id} isBusiness={ws.type === "BUSINESS"} taxBps={bps} wsQuery={q} />
    </div>
  );
}
