import { accountKind } from "@/lib/account-kind";
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
import { loadMembers, type Member } from "@/lib/household";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CardReminders } from "@/components/card-reminders";
import { CreditMeter } from "@/components/credit-meter";
import { utilization } from "@/lib/budget/utilization";
import { proofFor, type ProofSummary } from "@/lib/proof-math";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  CHECKING: "Checking · debit", SAVINGS: "Savings", CREDIT_CARD: "Credit card", CASH: "Cash · in hand", INVESTMENT: "Investment",
  LOAN: "Loan", PROPERTY: "Property", OTHER_ASSET: "Other asset", OTHER_LIABILITY: "Other liability",
};

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const workspace = await getWorkspace(wsKey);
  const accounts = await getAccountBalances(workspace.id);
  const cards = new Map((await loadCardStatuses(workspace.id, startOfMonthUTC(isoToDate(todayIso())))).map((c) => [c.id, c]));
  const members = await loadMembers();
  const me = await getCurrentUser();
  const wsQ = wsKey === "business" ? "?ws=business" : "";
  const latest = new Map<string, { date: string; gapCents: number; adjustedCents: number }>();
  try {
    const cps = await prisma.balanceCheckpoint.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 500 });
    for (const c of cps) if (!latest.has(c.accountId)) latest.set(c.accountId, { date: dateToIso(c.date), gapCents: c.gapCents, adjustedCents: c.adjustedCents });
  } catch { /* table not created yet */ }
  const proofs = new Map<string, ProofSummary>(accounts.filter((a) => a.balanceMode === "TRANSACTION_DERIVED").map((a) => [a.id, proofFor(latest.get(a.id) ?? null, todayIso())]));
  const matched = [...proofs.values()].filter((p) => p.state === "matched").length;
  const onBudget = accounts.filter((a) => a.onBudget);
  const cashAccts = onBudget.filter((a) => a.type === "CASH");
  const bankAccts = onBudget.filter((a) => a.type !== "CASH" && a.type !== "CREDIT_CARD");
  const cardAccts = onBudget.filter((a) => a.type === "CREDIT_CARD");
  const cardList = [...cards.values()];
  const withLimit = cardList.filter((c) => c.limitCents);
  const allUtil = utilization(withLimit.reduce((s, c) => s + c.owedCents, 0), withLimit.reduce((s, c) => s + (c.limitCents ?? 0), 0));
  const sub = (rows: typeof accounts) => `Subtotal: ${formatCents(rows.reduce((s, a) => s + a.balanceCents, 0))}`;
  const offBudget = accounts.filter((a) => !a.onBudget);
  const total = onBudget.reduce((s, a) => s + a.balanceCents, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{workspace.name} accounts</h1>
        <div className="ml-auto flex items-center gap-2"><TransferButton accounts={accounts.filter((a) => a.onBudget && a.type !== "CREDIT_CARD" && a.balanceMode !== "MANUAL").map((a) => ({ id: a.id, name: a.name, kind: accountKind(a.type) }))} today={todayIso()} /><AddAccountButton workspaceId={workspace.id} today={todayIso()} members={members} meId={me?.id} /></div>
      </div>
      <div className="flex gap-2 text-sm font-semibold" role="tablist" aria-label="Accounts view">
        <span role="tab" aria-selected className="rounded-full bg-navy px-4 py-2 text-white">Accounts</span>
        <Link role="tab" aria-selected={false} href={`/holdings${wsQ}`} className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Assets &amp; liabilities</Link>
      </div>

      {proofs.size > 0 && (
        <Link href={`/accounts/check${wsQ}`} className="card flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-sm hover:border-[#4F46E5]">
          <span><span className="font-semibold">{matched} of {proofs.size}</span> account{proofs.size === 1 ? "" : "s"} matched your bank in the last 14 days</span>
          <span className="shrink-0 font-semibold text-[#2E6BE6] dark:text-indigo-300">Check balances</span>
        </Link>
      )}

      {accounts.length === 0 && (
        <div className="card p-5 text-sm">No accounts yet. Add your checking account first, with today’s balance as the opening balance.</div>
      )}

      <CardReminders cards={cardList} wsQ={wsQ} />
      {cardList.length > 0 && (
        <section className="card space-y-3 p-4" aria-label="Credit card limits">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Credit used</h2>
            {allUtil && <span className="nums text-xs text-slate-500">{formatCents(allUtil.availableCents)} available across {withLimit.length} card{withLimit.length === 1 ? "" : "s"}</span>}
          </div>
          {allUtil && withLimit.length > 1 && <CreditMeter owedCents={allUtil.usedCents} limitCents={allUtil.limitCents} />}
          <ul className="space-y-3">
            {cardList.map((c) => (
              <li key={c.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm"><Link href={`/accounts/${c.id}${wsQ}`} className="font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300">{c.name}</Link>{!c.limitCents && <Link href={`/accounts/${c.id}${wsQ}`} className="text-xs font-semibold text-[#2E6BE6] dark:text-indigo-300">Add credit limit</Link>}</div>
                {c.limitCents ? <CreditMeter owedCents={c.owedCents} limitCents={c.limitCents} compact /> : <p className="nums text-xs text-slate-500">{formatCents(c.owedCents)} owed</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {cashAccts.length > 0 && <AccountTable title="Cash in hand (wallet, cash envelope)" rows={cashAccts} wsQ={wsQ} proofs={proofs} members={members} footer={sub(cashAccts)} />}
      {bankAccts.length > 0 && <AccountTable title="Bank accounts (debit card, checking, savings)" rows={bankAccts} wsQ={wsQ} proofs={proofs} members={members} footer={sub(bankAccts)} />}
      {cardAccts.length > 0 && <AccountTable title="Credit cards (balances show what you owe)" rows={cardAccts} wsQ={wsQ} cards={cards} proofs={proofs} members={members} footer={sub(cardAccts)} />}
      {onBudget.length > 0 && <p className="nums text-right text-sm font-semibold text-slate-700 dark:text-slate-200">Total on budget: {formatCents(total)}</p>}
      {offBudget.length > 0 && (
        <AccountTable title="Off budget (counts toward net worth only)" rows={offBudget} wsQ={wsQ} members={members} proofs={proofs} />
      )}
    </div>
  );
}

function AccountTable({ title, rows, wsQ, footer, cards, members, proofs }: { proofs: Map<string, ProofSummary>; members: Member[]; title: string; rows: Awaited<ReturnType<typeof getAccountBalances>>; wsQ: string; footer?: string; cards?: Map<string, { owedCents: number; shortCents: number; nextDue: { days: number } | null }> }) {
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
                {proofs.get(a.id) && (() => { const p = proofs.get(a.id)!; return <Link href={`/accounts/check${wsQ}${wsQ ? "&" : "?"}account=${a.id}`} className={`block text-xs ${p.state === "matched" ? "font-medium text-pos" : p.state === "off" ? "font-semibold text-neg" : p.state === "stale" ? "font-medium text-warn" : "text-slate-500"} hover:underline`}>{p.state === "matched" ? "✓ " : p.state === "off" ? "⚠ " : ""}{p.label}</Link>; })()}
                {members.length > 1 && a.onBudget && <div className="text-xs text-slate-500">Steward: <span className="font-medium text-slate-700 dark:text-slate-200">{members.find((m) => m.id === a.stewardId)?.name ?? "none"}</span></div>}
                {cards?.get(a.id) && (() => { const c = cards.get(a.id)!; return c.owedCents === 0 ? null : c.shortCents > 0
                  ? <div className="nums text-xs font-medium text-neg">{formatCents(c.shortCents)} short: not set aside yet</div>
                  : <div className="text-xs font-medium text-pos">All set aside ✓</div>; })()}
                {cards?.get(a.id) && cards.get(a.id)!.owedCents > 0 && cards.get(a.id)!.nextDue && (() => { const d = cards.get(a.id)!.nextDue!.days; return <div className={`text-xs ${d <= 5 ? "font-semibold text-warn" : "text-slate-500"}`}>Payment due {inDays(d)}</div>; })()}
              </td>
              <td className={`td nums text-right font-medium ${a.balanceCents < 0 ? "text-[#C9372C]" : ""}`}>{formatCents(a.balanceCents)}</td>
              <td className="td w-12 !pl-0 text-right">
                {a.balanceMode === "MANUAL"
                  ? <Link href={`/holdings${wsQ}`} className="btn btn-sm !min-h-10" aria-label={`Edit ${a.name} in assets & liabilities`}>Edit</Link>
                  : <EditAccountButton account={{ id: a.id, name: a.name, type: a.type, openingBalanceCents: a.openingBalanceCents, openingBalanceDate: a.openingBalanceDate ? dateToIso(a.openingBalanceDate) : null, onBudget: a.onBudget, stewardId: a.stewardId }} members={members} />}
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
