import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { getAccountBalances } from "@/lib/budget/summary";
import { formatCents } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/dates";
import { AddAccountButton } from "./add-account";

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
  const wsQ = wsKey === "business" ? "?ws=business" : "";
  const onBudget = accounts.filter((a) => a.onBudget);
  const offBudget = accounts.filter((a) => !a.onBudget);
  const total = onBudget.reduce((s, a) => s + a.balanceCents, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{workspace.name} accounts</h1>
        <div className="ml-auto"><AddAccountButton workspaceId={workspace.id} today={todayIso()} /></div>
      </div>

      {accounts.length === 0 && (
        <div className="card p-5 text-sm">No accounts yet. Add your checking account first, with today’s balance as the opening balance.</div>
      )}

      {onBudget.length > 0 && (
        <AccountTable title="On budget" rows={onBudget} wsQ={wsQ} footer={`Total on budget: ${formatCents(total)}`} />
      )}
      {offBudget.length > 0 && (
        <AccountTable title="Off budget (counts toward net worth only)" rows={offBudget} wsQ={wsQ} />
      )}
    </div>
  );
}

function AccountTable({ title, rows, wsQ, footer }: { title: string; rows: Awaited<ReturnType<typeof getAccountBalances>>; wsQ: string; footer?: string }) {
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
              </td>
              <td className={`td nums text-right font-medium ${a.balanceCents < 0 ? "text-[#C9372C]" : ""}`}>{formatCents(a.balanceCents)}</td>
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot><tr><td colSpan={2} className="td nums border-t border-[#E2E8F0] text-right text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">{footer}</td></tr></tfoot>
        )}
      </table>
    </section>
  );
}
