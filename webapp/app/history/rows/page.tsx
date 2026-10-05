import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { getSealedThrough, historyReady } from "@/lib/history";
import { dateToIso } from "@/lib/utils/dates";
import { RowsClient, type RowVM } from "./rows-client";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function HistoryRowsPage({ searchParams }: { searchParams: Promise<{ ws?: string; account?: string; year?: string; q?: string; todo?: string; page?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const wsKey = wsKeyFromParam(sp.ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";
  const back = <Link href={`/history${q}`} className="text-sm font-semibold text-blue-700 dark:text-blue-300">← History</Link>;
  if (!(await historyReady())) return <div className="space-y-3">{back}<div className="card p-5 text-sm">Run the History migration first.</div></div>;

  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = {
    workspaceId: ws.id,
    ...(sp.account ? { accountId: sp.account } : {}),
    ...(year ? { date: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lte: new Date(`${year}-12-31T00:00:00.000Z`) } } : {}),
    ...(sp.q ? { OR: [{ payee: { contains: sp.q, mode: "insensitive" as const } }, { memo: { contains: sp.q, mode: "insensitive" as const } }] } : {}),
    ...(sp.todo === "1" ? { typeKey: null, kind: { not: "TRANSFER" } } : {}),
  };
  const [accounts, total, rows, sealed] = await Promise.all([
    prisma.account.findMany({ where: { workspaceId: ws.id, historicalTransactions: { some: {} } }, select: { id: true, name: true, isArchived: true }, orderBy: { name: "asc" } }),
    prisma.historicalTransaction.count({ where }),
    prisma.historicalTransaction.findMany({ where, orderBy: [{ date: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
    getSealedThrough(ws.id),
  ]);
  const allAccounts = await prisma.account.findMany({ where: { workspaceId: ws.id, balanceMode: "TRANSACTION_DERIVED" }, select: { id: true, name: true, isArchived: true }, orderBy: [{ isArchived: "asc" }, { name: "asc" }] });
  const accName = new Map(allAccounts.concat(accounts).map((a) => [a.id, a.name]));
  const vms: RowVM[] = rows.map((r) => ({ id: r.id, accountId: r.accountId, account: accName.get(r.accountId) ?? "", date: dateToIso(r.date), amountCents: r.amountCents, payee: r.payee, memo: r.memo, kind: r.kind, typeKey: r.typeKey, sealed: sealed !== null && r.date.getUTCFullYear() <= sealed }));
  return (
    <div className="space-y-4">
      {back}
      <h1 className="text-2xl font-semibold tracking-tight">History rows</h1>
      <RowsClient workspaceId={ws.id} isBusiness={ws.type === "BUSINESS"} rows={vms} total={total} page={page} pageSize={PAGE}
        accounts={allAccounts.map((a) => ({ id: a.id, name: a.isArchived ? `${a.name} (closed)` : a.name }))}
        filters={{ account: sp.account ?? "", year: sp.year ?? "", q: sp.q ?? "", todo: sp.todo === "1" }} wsQuery={q} />
    </div>
  );
}
