import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { holdingsAt } from "@/lib/reports/holdings";
import { loadHoldingMeta } from "@/lib/reports/holding-meta";
import { holdingLabel } from "@/lib/holdings";
import { todayIso } from "@/lib/utils/dates";
import { PayoffPlanner, type PlannerDebt } from "./payoff-planner";

export const dynamic = "force-dynamic";

export default async function PayoffPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const ws = await getWorkspace(wsKey);
  const wsQ = wsKey === "business" ? "?ws=business" : "";
  const today = todayIso();
  const debts = (await holdingsAt([ws.id], today)).filter((r) => r.side === "LIABILITY" && r.valueCents > 0);
  const meta = await loadHoldingMeta(debts.map((d) => d.id));
  const list: PlannerDebt[] = debts.map((d) => ({
    id: d.id, name: d.name, label: holdingLabel(d.cls), balanceCents: d.valueCents, aprBps: meta.get(d.id)?.aprBps ?? null,
    paymentCents: d.monthlyCashflowCents, href: `/holdings/${d.id}${wsQ}`, defaultOn: d.cls !== "MORTGAGE",
  }));
  return (
    <div className="space-y-4">
      <Link href={`/holdings${wsQ}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300"><ArrowLeft className="size-4" aria-hidden /> Assets &amp; liabilities</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Debt payoff plan</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">See when you&apos;ll be debt-free, and how extra payments change it. Your mortgage starts switched off (most people tackle it last); turn it on below if you like.</p>
      </div>
      {list.length === 0 ? <p className="card p-4 text-sm text-slate-500">You have no debts recorded. Nice.</p> : <PayoffPlanner debts={list} today={today} />}
    </div>
  );
}
