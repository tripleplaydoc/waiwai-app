import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getStatus() {
  try {
    const [workspaces, categories, accounts, transactions] = await Promise.all([
      prisma.workspace.count(), prisma.category.count(), prisma.account.count(), prisma.transaction.count(),
    ]);
    return { connected: true as const, workspaces, categories, accounts, transactions };
  } catch (err) {
    return { connected: false as const, error: err instanceof Error ? err.message : "Unknown error connecting to the database." };
  }
}

export default async function StatusPage() {
  await requireAuth();
  const s = await getStatus();
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">System status</h1>
      <div className="card p-5">
        {s.connected ? (
          <>
            <p className="mb-3 font-semibold text-[#2E7D32]">Database connected</p>
            <dl className="nums grid grid-cols-[1fr_auto] gap-y-2 text-sm">
              <dt className="text-slate-500">Workspaces</dt><dd className="text-right">{s.workspaces}</dd>
              <dt className="text-slate-500">Categories</dt><dd className="text-right">{s.categories}</dd>
              <dt className="text-slate-500">Accounts</dt><dd className="text-right">{s.accounts}</dd>
              <dt className="text-slate-500">Transactions</dt><dd className="text-right">{s.transactions}</dd>
            </dl>
          </>
        ) : (
          <>
            <p className="mb-2 font-semibold text-[#8A5A00]">Database not reachable</p>
            <p className="mb-2 text-sm text-slate-500">Check DATABASE_URL in Netlify, and that the Supabase project isn’t paused.</p>
            <pre className="overflow-x-auto rounded-xl border border-[#E2E8F0] p-3 text-xs dark:border-slate-700">{s.error}</pre>
          </>
        )}
      </div>
    </div>
  );
}
