import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ ws?: string; account?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const wsKey = wsKeyFromParam(sp.ws);
  const workspace = await getWorkspace(wsKey);
  const accounts = await prisma.account.findMany({ where: { workspaceId: workspace.id, isArchived: false }, orderBy: { name: "asc" } });
  const initial = accounts.find((a) => a.id === sp.account)?.id ?? accounts[0]?.id ?? "";
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Import bank statement (CSV)</h1>
      {accounts.length === 0 ? (
        <div className="card p-5 text-sm">Add an account first (Accounts page), then come back to import into it.</div>
      ) : (
        <ImportClient accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} initialAccountId={initial} workspaceLabel={workspace.name} wsQuery={wsKey === "business" ? "?ws=business" : ""} />
      )}
    </div>
  );
}
