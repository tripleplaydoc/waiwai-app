import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { cutoffsFor, getGoLive, historyReady } from "@/lib/history";
import { HistoryImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function HistoryImportPage({ searchParams }: { searchParams: Promise<{ ws?: string; account?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const wsKey = wsKeyFromParam(sp.ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";
  const back = <Link href={`/history${q}`} className="text-sm font-semibold text-blue-700 dark:text-blue-300">← History</Link>;
  if (!(await historyReady())) return <div className="space-y-3">{back}<div className="card p-5 text-sm">Run the History migration in Supabase first, then reload.</div></div>;
  const goLive = await getGoLive(ws.id);
  if (!goLive) return <div className="space-y-3">{back}<div className="card p-5 text-sm">Set your go-live day on the History page first.</div></div>;
  const accounts = await prisma.account.findMany({ where: { workspaceId: ws.id, balanceMode: "TRANSACTION_DERIVED" }, orderBy: [{ isArchived: "asc" }, { name: "asc" }] });
  const cut = await cutoffsFor(ws.id, goLive);
  const initial = accounts.find((a) => a.id === sp.account)?.id ?? accounts[0]?.id ?? "";
  return (
    <div className="space-y-5">
      {back}
      <h1 className="text-2xl font-semibold tracking-tight">Import past years (CSV)</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">Rows go into the History layer only. They never change a balance, Ready to Assign or a pocket. Import one account at a time, one year or many in the same file, and re-importing a file is safe.</p>
      {accounts.length === 0 ? <div className="card p-5 text-sm">Add an account first.</div> : (
        <HistoryImportClient accounts={accounts.map((a) => ({ id: a.id, name: a.isArchived ? `${a.name} (closed)` : a.name, cutoff: cut.get(a.id) ?? goLive }))} initialAccountId={initial} isBusiness={ws.type === "BUSINESS"} wsQuery={q} />
      )}
    </div>
  );
}
