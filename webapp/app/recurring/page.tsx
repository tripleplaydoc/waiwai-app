import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { loadRecurring, postDue, suggestRecurring } from "@/lib/recurring";
import { monthlyEquivalent } from "@/lib/recurring-math";
import { formatCents } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/dates";
import { RecurringClient } from "./recurring-client";

export const dynamic = "force-dynamic";

export default async function RecurringPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";
  const today = todayIso();
  await postDue(ws.id, { onlyAuto: true, today });
  const items = await loadRecurring(ws.id, today);
  const [accounts, cats, groups] = await Promise.all([
    prisma.account.findMany({ where: { workspaceId: ws.id, isArchived: false, balanceMode: "TRANSACTION_DERIVED" }, orderBy: [{ onBudget: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.category.findMany({ where: { workspaceId: ws.id, isArchived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, type: true, categoryGroupId: true } }),
    prisma.categoryGroup.findMany({ where: { workspaceId: ws.id }, select: { id: true, name: true } }),
  ]);
  const suggestions = await suggestRecurring(ws.id, items, today).catch(() => []);
  const gname = new Map(groups.map((g) => [g.id, g.name]));
  const active = items.filter((i) => i.isActive);
  const outMonthly = active.filter((i) => i.amountCents < 0).reduce((s, i) => s + monthlyEquivalent(i.amountCents, i.frequency), 0);
  const inMonthly = active.filter((i) => i.amountCents > 0).reduce((s, i) => s + monthlyEquivalent(i.amountCents, i.frequency), 0);
  return (
    <div className="space-y-5">
      <Link href={`/accounts${q}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300"><ArrowLeft className="size-4" aria-hidden /> Accounts</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recurring</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Charges and deposits that repeat. Set one up once; each time it comes due it either posts by itself or waits for your tap.</p>
      </div>
      <section className="grid grid-cols-2 gap-3" aria-label="Totals">
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Going out</p><p className="nums mt-1 text-xl font-bold">{formatCents(outMonthly)}<span className="text-sm font-medium text-slate-500">/mo</span></p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coming in</p><p className="nums mt-1 text-xl font-bold text-pos">{formatCents(inMonthly)}<span className="text-sm font-medium text-slate-500">/mo</span></p></div>
      </section>
      <RecurringClient
        workspaceId={ws.id} today={today} items={items} suggestions={suggestions}
        accounts={accounts}
        pockets={cats.map((c) => ({ id: c.id, name: c.name, group: c.categoryGroupId ? gname.get(c.categoryGroupId) ?? "Other" : "Other", income: c.type === "INCOME" }))}
        isBusiness={ws.type === "BUSINESS"}
      />
    </div>
  );
}
