import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { getAccountBalances } from "@/lib/budget/summary";
import { dateToIso, todayIso } from "@/lib/utils/dates";
import { proofFor } from "@/lib/proof-math";
import { CheckClient } from "./check-client";

export const dynamic = "force-dynamic";

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ ws?: string; account?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const wsKey = wsKeyFromParam(sp.ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";
  const today = todayIso();
  const accounts = (await getAccountBalances(ws.id)).filter((a) => a.balanceMode === "TRANSACTION_DERIVED");
  let latest = new Map<string, { date: string; gapCents: number; adjustedCents: number }>();
  try {
    const cps = await prisma.balanceCheckpoint.findMany({ where: { workspaceId: ws.id }, orderBy: [{ createdAt: "desc" }], take: 500 });
    for (const c of cps) if (!latest.has(c.accountId)) latest.set(c.accountId, { date: dateToIso(c.date), gapCents: c.gapCents, adjustedCents: c.adjustedCents });
  } catch { /* table not created yet */ }
  const rows = accounts.map((a) => ({
    id: a.id, name: a.name, type: a.type, balanceCents: a.balanceCents,
    liability: ["CREDIT_CARD", "LOAN", "OTHER_LIABILITY"].includes(a.type),
    proof: proofFor(latest.get(a.id) ?? null, today),
  }));
  return (
    <div className="space-y-5">
      <Link href={`/accounts${q}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300"><ArrowLeft className="size-4" aria-hidden /> Accounts</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Balance check</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Type the balance your bank shows. The app compares it to its own number, tells you if they differ and why, and remembers the check so you can see when each account last matched.</p>
      </div>
      {rows.length === 0 ? <div className="card p-5 text-sm">No accounts to check yet.</div> : <CheckClient accounts={rows} today={today} initialId={sp.account} />}
    </div>
  );
}
