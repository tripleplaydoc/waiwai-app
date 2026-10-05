import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { holdingOf, holdingLabel, holdingSide } from "@/lib/holdings";
import { balancesAt, holdingsAt, periodEnds } from "@/lib/reports/holdings";
import { loadHoldingMeta } from "@/lib/reports/holding-meta";
import { formatCents } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/dates";
import { Sparkline } from "@/components/sparkline";
import { Section } from "./ui";
import { PositionsSection } from "./positions-section";
import { VehicleSection } from "./vehicle-section";
import { LoanSection } from "./loan-section";
import { AssetInfoSection } from "./asset-info-section";

export const dynamic = "force-dynamic";

const dayDiff = (a: string, b: string) => Math.round((Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 86_400_000);

export default async function HoldingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const acct = await prisma.account.findUnique({ where: { id }, include: { workspace: true, manualBalanceEntries: { orderBy: { asOfDate: "desc" }, take: 40 } } });
  if (!acct || acct.isArchived) notFound();
  if (acct.balanceMode !== "MANUAL") redirect(`/accounts/${id}`);

  const today = todayIso();
  const cls = holdingOf(acct), side = holdingSide(cls);
  const wsQ = acct.workspace.type === "BUSINESS" ? "?ws=business" : "";
  const ends = periodEnds("monthly", today, 12);
  const series = (await balancesAt([acct], ends.map((e) => e.end))).get(acct.id)!.map((v) => (side === "ASSET" ? v : -v));
  const value = series[series.length - 1], prev = series[series.length - 2] ?? value;
  const delta = value - prev;
  const better = side === "ASSET" ? delta > 0 : delta < 0;
  const meta = (await loadHoldingMeta([acct.id])).get(acct.id)!;
  const rows = await holdingsAt([acct.workspace.id], today);
  const loans = rows.filter((r) => r.side === "LIABILITY" && r.id !== acct.id).map((r) => ({ id: r.id, name: r.name, owedCents: r.valueCents }));
  const daysSinceValued = meta.valuedOn ? dayDiff(today, meta.valuedOn) : null;
  const priced = cls === "CRYPTO" || cls === "STOCKS_FUNDS";
  const hasPositions = priced && meta.positions.length > 0;
  const paymentCents = acct.monthlyCashflowCents ?? 0;

  return (
    <div className="space-y-4">
      <Link href={`/holdings${wsQ}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300"><ArrowLeft className="size-4" aria-hidden /> Assets &amp; liabilities</Link>

      <section className="card p-4" aria-label="Summary">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{holdingLabel(cls)} · {acct.workspace.name}</div>
        <h1 className="truncate text-xl font-semibold tracking-tight">{acct.name}</h1>
        <div className={`nums mt-1 text-3xl font-bold ${side === "ASSET" ? "text-pos" : "text-neg"}`}>{formatCents(value)}</div>
        <div className="nums text-xs text-slate-500">
          {side === "ASSET" ? "Worth" : "Owed"}{delta !== 0 && <> · <span className={better ? "text-pos" : "text-neg"}>{delta > 0 ? "▲" : "▼"} {formatCents(Math.abs(delta))}</span> since last month</>}
        </div>
        <div className="mt-2"><Sparkline values={series} color={side === "ASSET" ? "#059669" : "#DC2626"} /></div>
      </section>

      {priced && <PositionsSection accountId={acct.id} workspaceId={acct.workspaceId} kind={cls === "CRYPTO" ? "CRYPTO" : "STOCK"} positions={meta.positions} cashCents={meta.cashCents} today={today} />}
      {priced && !hasPositions && value > 0 && <p className="text-xs text-slate-500">This is currently valued by hand at {formatCents(value)}. Add your {cls === "CRYPTO" ? "coins" : "shares"} above and the value will follow live prices instead.</p>}
      {cls === "VEHICLE" && <VehicleSection accountId={acct.id} meta={meta} valueCents={value} today={today} daysSinceValued={daysSinceValued} />}
      {side === "LIABILITY" && <LoanSection accountId={acct.id} meta={meta} owedCents={value} paymentCents={paymentCents} today={today} />}
      {side === "ASSET" && <AssetInfoSection accountId={acct.id} meta={meta} valueCents={value} loans={loans} hidePurchase={hasPositions} />}

      <details className="card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Value history</summary>
        <ul className="divide-y divide-[#E2E8F0] border-t border-[#E2E8F0] dark:divide-slate-800 dark:border-slate-800">
          {acct.manualBalanceEntries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="nums w-28 shrink-0 text-slate-600 dark:text-slate-300">{e.asOfDate.toISOString().slice(0, 10)}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{e.note ?? ""}</span>
              <span className="nums shrink-0 font-semibold">{formatCents(Math.abs(e.balanceCents))}</span>
            </li>
          ))}
          {acct.manualBalanceEntries.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No values recorded yet.</li>}
        </ul>
      </details>
      <Section title="Where this shows up">
        <p className="text-sm text-slate-600 dark:text-slate-300">It counts toward your {side === "ASSET" ? "assets" : "liabilities"} and net worth, and every value above is kept so the Assets report can show how it changes over time.</p>
      </Section>
    </div>
  );
}
