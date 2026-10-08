import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { Hint } from "@/components/hint";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ ws?: string; account?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const wsKey = wsKeyFromParam(sp.ws);
  const workspace = await getWorkspace(wsKey);
  const accounts = await prisma.account.findMany({ where: { workspaceId: workspace.id, isArchived: false }, orderBy: { name: "asc" } });
  const pockets = await prisma.category.findMany({
    where: { workspaceId: workspace.id, isArchived: false, isSystemManaged: false, type: "EXPENSE" },
    include: { categoryGroup: { select: { name: true } } },
    orderBy: [{ categoryGroup: { sortOrder: "asc" } }, { name: "asc" }],
  });
  const initial = accounts.find((a) => a.id === sp.account)?.id ?? accounts[0]?.id ?? "";
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Import bank statement</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">For recent activity in your live budget. Each row can be filed under a pocket <Hint>A pocket is one of your spending envelopes, like Groceries or Rent. Filing a row under it takes the money from that envelope.</Hint>. Importing past years? Use <Link className="font-semibold underline" href={`/history/import${wsKey === "business" ? "?ws=business" : ""}`}>History import</Link>, which keeps old data from changing your balances.</p>
      {accounts.length === 0 ? (
        <div className="card p-5 text-sm">Add an account first (Accounts page), then come back to import into it.</div>
      ) : (
        <ImportClient accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} initialAccountId={initial} pockets={pockets.map((c) => ({ id: c.id, name: c.name, group: c.categoryGroup?.name ?? "Other" }))} workspaceLabel={workspace.name} wsQuery={wsKey === "business" ? "?ws=business" : ""} />
      )}
    </div>
  );
}
