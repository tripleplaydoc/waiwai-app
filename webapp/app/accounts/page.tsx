import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { getAccountBalances } from "@/lib/budget/summary";
import { formatCents } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/dates";
import { loadCardStatuses } from "@/lib/budget/cards";
import { startOfMonthUTC } from "@/lib/budget/dates";
import { isoToDate } from "@/lib/utils/dates";
import { inDays } from "@/lib/cycle";
import { AddAccountButton } from "./add-account";
import { TransferButton } from "@/components/transfer-button";
import { EditAccountButton } from "./edit-account";
import { dateToIso } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  CHECKING: "Checking", SAVINGS: "Savings", CREDIT_CARD: "Credit card", CASH: "Cash", INVESTMENT: "Investment",
  LOAN: "Loan", PROPERTY: "Property", OTHER_ASSET: "Other asset", OTHER_LIABILITY: "Other liability",
};

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const workspace = await getWorkspace(wsKey);
  const accounts = await getAccountBalances(workspace.id);
  const cards = new Map((await loadCardStatuses(workspace.id, startOfMonthUTC(isoToDate(todayIso())))).map((c) => [c.id, c]));
  const wsQ = wsKey === "business" ? "?ws=business" : "";
  const onBudget = accounts.filter((a) => a.onBudget);
  const offBudget = accounts.filter((a) => !a.onBudget);
  const total = onBudget.reduce((s, a) => s + a.balanceCents, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{workspace.name} accounts</h1>
        <div className="ml-auto flex items-center gap-2"><TransferButton accounts={accounts.filter((a) => a.onBudget && a.type !== "CREDIT_CARD" && a.balanceMode !== "MANUAL").map((a) => ({ id: a.id, name: a.name }))} today={todayIso()} /><AddAccountButton workspaceId={workspace.id} today={todayIso()} /></div>
      </div>
      <div className="flex gap-2 text-sm font-semibold" role="tablist" aria-label="Accounts view">
        <span role="tab" aria-selected className="rounded-full bg-navy px-4 py-2 text-white">Accounts</span>
        <Link role="tab" aria-selected={false} href={`/holdings${wsQ}`} className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Assets &amp; liabilities</Link>
      </div>

      {accounts.length === 0 && (
        <div className="card p-5 text-sm">No accounts yet. Add your checking account first, with today’s balance as the opening balance.</div>
      )}

      {onBudget.length > 0 && (
        <AccountTable title="On budget" rows={onBudget} wsQ={wsQ} cards={cards} footer={`Total on budget: ${formatCents(total)}`} />
      )}
      {offBudget.length > 0 && (
        <AccountTable title="Off budget (counts toward net worth only)" rows={offBudget} wsQ={wsQ} />
      )}
    </div>
  );
}

function AccountTable({ title, rows, wsQ, footer, cards }: { title: string; rows: Awaited<ReturnType<typeof getAccountBalances>>; wsQ: string; footer?: string; cards?: Map<string, { owedCents: number; shortCents: number; nextDue: { days: number } | null }> }) {
  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-[#E2E8F0] bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">{title}</h2>
      <table className="w-full border-collapse">
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-b border-[#E2E8F0] last:border-0 dark:border-slate-800">
              <td className="td">
                <Link href={`/accounts/${a.id}${wsQ}`} className="font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300">{a.name}</Link>
                <span className="ml-2 text-xs text-slate-500">{TYPE_LABEL[a.type]}</span>
                {cards?.get(a.id) && (() => { const c = cards.get(a.id)!; return c.owedCents === 0 ? null : c.shortCents > 0
                  ? <div className="nums text-xs font-medium text-neg">{formatCents(c.shortCents)} short: not set aside yet</div>
                  : <div className="text-xs font-medium text-pos">All set aside ✓</div>; })()}
                {cards?.get(a.id) && cards.get(a.id)!.owedCents > 0 && cards.get(a.id)!.nextDue && (() => { const d = cards.get(a.id)!.nextDue!.days; return <div className={`text-xs ${d <= 5 ? "font-semibold text-warn" : "text-slate-500"}`}>Payment due {inDays(d)}</div>; })()}
              </td>
              <td className={`td nums text-right font-medium ${a.balanceCents < 0 ? "text-[#C9372C]" : ""}`}>{formatCents(a.balanceCents)}</td>
              <td className="td w-12 !pl-0 text-right">
                {a.balanceMode === "MANUAL"
                  ? <Link href={`/holdings${wsQ}`} className="btn btn-sm !min-h-10" aria-label={`Edit ${a.name} in assets & liabilities`}>Edit</Link>
                  : <EditAccountButton account={{ id: a.id, name: a.name, type: a.type, openingBalanceCents: a.openingBalanceCents, openingBalanceDate: a.openingBalanceDate ? dateToIso(a.openingBalanceDate) : null, onBudget: a.onBudget }} />}
              </td>
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot><tr><td colSpan={3} className="td nums border-t border-[#E2E8F0] text-right text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">{footer}</td></tr></tfoot>
        )}
      </table>
    </section>
  );
}
