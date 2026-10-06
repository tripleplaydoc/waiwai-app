import { accountKind } from "@/lib/account-kind";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Upload } from "lucide-react";
import { getCurrentUser, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/utils/currency";
import { dateToIso, formatShortDate, todayIso } from "@/lib/utils/dates";
import { deleteTransactionAction } from "@/app/actions/transactions";
import { TagEditor } from "@/components/tag-picker";
import { EditAccountButton } from "../edit-account";
import { loadCardStatuses } from "@/lib/budget/cards";
import { getBudgetSummary } from "@/lib/budget/summary";
import { startOfMonthUTC } from "@/lib/budget/dates";
import { isoToDate } from "@/lib/utils/dates";
import { CardPanel } from "./card-panel";
import { AddTransactionButton, CategorySelect, ClearedButton, ConfirmDeleteButton, EditTransactionButton, PersonSelect, ReceiptCell, type EditableTx } from "./transaction-controls";

export const dynamic = "force-dynamic";
const LIMIT = 300;

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ person?: string }> }) {
  await requireAuth();
  const { id } = await params;
  const { person } = await searchParams;
  const account = await prisma.account.findUnique({ where: { id }, include: { workspace: true, manualBalanceEntries: { orderBy: { asOfDate: "desc" }, take: 1 } } });
  if (!account) notFound();

  const [transactions, sum, categories, groups, payees, allAccounts, usersDb, me] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId: id, ...(person === "none" ? { personId: null } : person ? { personId: person } : {}) },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: LIMIT,
      include: { payee: true, receipt: { select: { id: true, fileName: true } }, importBatch: { select: { fileName: true } }, _count: { select: { splits: true } } },
    }),
    prisma.transaction.aggregate({ where: { accountId: id }, _sum: { amountCents: true } }),
    prisma.category.findMany({ where: { workspaceId: account.workspaceId, isArchived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.categoryGroup.findMany({ where: { workspaceId: account.workspaceId, isArchived: false } }),
    prisma.payee.findMany({ where: { workspaceId: account.workspaceId, isArchived: false }, orderBy: { name: "asc" }, take: 500 }),
    prisma.account.findMany({ where: { workspaceId: account.workspaceId, isArchived: false }, orderBy: [{ onBudget: "desc" }, { name: "asc" }], select: { id: true, name: true, type: true } }),
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true } }),
    getCurrentUser(),
  ]);
  const people = usersDb.map((u) => ({ id: u.id, name: u.name || u.email.split("@")[0] }));
  const total = await prisma.transaction.count({ where: { accountId: id } });
  // Pending = entered but the bank hasn't posted it yet. It still counts in the balance; this just shows how much of it is still in flight.
  const pendingAgg = await prisma.transaction.aggregate({ where: { accountId: id, clearedStatus: "UNCLEARED" }, _sum: { amountCents: true }, _count: true });
  const pendingCents = pendingAgg._sum.amountCents ?? 0;
  const pendingCount = pendingAgg._count;
  const balance = account.balanceMode === "MANUAL" ? account.manualBalanceEntries[0]?.balanceCents ?? 0 : account.openingBalanceCents + (sum._sum.amountCents ?? 0);
  const clearedBalance = balance - pendingCents;
  const isBiz = account.workspace.type === "BUSINESS";
  const payeeNames = payees.map((p) => p.name);
  const editable = (t: (typeof transactions)[number]): EditableTx => ({
    id: t.id, date: dateToIso(t.date), payee: t.payee?.name ?? "", amountCents: t.amountCents, memo: t.memo ?? "", categoryId: t.categoryId ?? "", personId: t.personId ?? "",
    status: t.clearedStatus, isTransfer: !!t.transferGroupId, isSplit: t._count.splits > 0, deductible: t.isTaxDeductible, source: t.importBatch?.fileName ?? null,
  });
  const wsQ = account.workspace.type === "BUSINESS" ? "?ws=business" : "";
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const catOptions = categories.map((c) => ({ id: c.id, name: c.name, group: c.categoryGroupId ? groupName.get(c.categoryGroupId) ?? "Other" : "Other", type: c.type, paidFromId: c.paidFromAccountId }));

  const isCard = account.type === "CREDIT_CARD" && account.onBudget && account.balanceMode !== "MANUAL";
  const thisMonth = startOfMonthUTC(isoToDate(todayIso()));
  const card = isCard ? (await loadCardStatuses(account.workspaceId, thisMonth)).find((c) => c.id === account.id) : undefined;
  const cardPockets = card ? (await getBudgetSummary(account.workspaceId, thisMonth)).rows.filter((r) => r.type !== "INCOME").map((r) => ({ id: r.id, name: r.name, availableCents: r.availableCents })) : [];
  const payFrom = (await prisma.account.findMany({ where: { workspaceId: account.workspaceId, isArchived: false, onBudget: true, balanceMode: "TRANSACTION_DERIVED", NOT: { OR: [{ id: account.id }, { type: "CREDIT_CARD" }] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div>
          <Link href={`/accounts${wsQ}`} className="text-xs text-slate-500 hover:underline">← All accounts</Link>
          <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
        </div>
        <div className={`nums text-2xl font-semibold ${balance < 0 ? "text-[#C9372C]" : "text-[#2E7D32]"}`}>{formatCents(balance)}</div>
        {account.balanceMode !== "MANUAL" && <EditAccountButton label="Edit" account={{ id: account.id, name: account.name, type: account.type, openingBalanceCents: account.openingBalanceCents, openingBalanceDate: account.openingBalanceDate ? dateToIso(account.openingBalanceDate) : null, onBudget: account.onBudget }} />}
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
          <Link href={`/import${wsQ}${wsQ ? "&" : "?"}account=${account.id}`} className="btn"><Upload className="size-4" aria-hidden /> Import CSV</Link>
          <AddTransactionButton
            accountId={account.id}
            accounts={allAccounts.map((a) => ({ id: a.id, name: a.name, kind: accountKind(a.type) }))}
            people={people}
            currentUserId={me?.id ?? null}
            isBusiness={account.workspace.type === "BUSINESS"}
            categories={catOptions}
            payees={payees.map((p) => p.name)}
            today={todayIso()}
          />
        </div>
      </div>

      {account.balanceMode !== "MANUAL" && (
        <section className="card grid grid-cols-3 divide-x divide-[#E2E8F0] text-center dark:divide-slate-800" aria-label="Balance breakdown">
          <div className="px-3 py-3"><div className="text-xs text-slate-500">Cleared</div><div className="nums text-lg font-semibold">{formatCents(clearedBalance)}</div><div className="text-[11px] text-slate-400">posted at the bank</div></div>
          <div className="px-3 py-3"><div className="text-xs text-slate-500">Pending</div><div className={`nums text-lg font-semibold ${pendingCount > 0 ? "text-warn" : ""}`}>{pendingCents > 0 ? "+" : pendingCents < 0 ? "−" : ""}{formatCents(Math.abs(pendingCents))}</div><div className="text-[11px] text-slate-400">{pendingCount} not yet cleared</div></div>
          <div className="px-3 py-3"><div className="text-xs text-slate-500">Total</div><div className="nums text-lg font-semibold">{formatCents(balance)}</div><div className="text-[11px] text-slate-400">cleared + pending</div></div>
        </section>
      )}

      {card && <CardPanel card={card} payFrom={payFrom} pockets={cardPockets} today={todayIso()} wsQ={wsQ} />}

      {people.length > 1 && (
        <form method="get" className="flex flex-wrap items-center gap-2" aria-label="Filter by person">
          <label htmlFor="flt-person" className="text-sm text-slate-600 dark:text-slate-300">Show</label>
          <select id="flt-person" name="person" defaultValue={person ?? ""} className="input !min-h-10 !w-auto !py-1.5">
            <option value="">Everyone</option>
            {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            <option value="none">Not assigned</option>
          </select>
          <button type="submit" className="btn btn-sm">Filter</button>
        </form>
      )}

      {/* Phone: one tidy card per transaction */}
      <section className="card divide-y divide-[#E2E8F0] overflow-hidden md:hidden dark:divide-slate-800" aria-label="Transactions">
        {transactions.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No transactions yet. Tap + to add one, or import a CSV.</p>}
        {transactions.map((t) => (
          <article key={t.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <ClearedButton transactionId={t.id} status={t.clearedStatus} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{t.payee?.name ?? <span className="font-normal text-slate-400">No payee</span>}</div>
                <div className="text-xs text-slate-500">{formatShortDate(t.date)}{t.memo ? ` · ${t.memo}` : ""}</div>
              </div>
              <div className={`nums shrink-0 text-[15px] font-semibold ${t.amountCents > 0 ? "text-pos" : ""}`}>{t.amountCents > 0 ? "+" : "−"}{formatCents(Math.abs(t.amountCents))}</div>
            </div>
            {t.transferGroupId ? <div className="text-xs font-medium text-slate-500">↔ Transfer (not spending)</div> : <CategorySelect transactionId={t.id} current={t.categoryId ?? ""} options={catOptions} needsReview={t.needsReview} />}
            <div className="flex flex-wrap items-center gap-2">
              {people.length > 1 && <div className="min-w-0 flex-1"><PersonSelect transactionId={t.id} current={t.personId ?? ""} people={people} /></div>}
              {t.amountCents < 0 && !t.transferGroupId && <TagEditor transactionId={t.id} tags={t.tags} />}
              <ReceiptCell transactionId={t.id} receipt={t.receipt} />
              <div className="ml-auto"><EditTransactionButton tx={editable(t)} categories={catOptions} payees={payeeNames} people={people} isBusiness={isBiz} label="Edit" /></div>
              <form action={deleteTransactionAction}>
                <input type="hidden" name="transactionId" value={t.id} />
                <ConfirmDeleteButton />
              </form>
            </div>
          </article>
        ))}
        {total > LIMIT && <p className="px-4 py-2 text-xs text-slate-500">Showing the latest {LIMIT} of {total} transactions.</p>}
      </section>

      <section className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1000px] border-collapse">
          <thead className="border-b border-[#E2E8F0] bg-navy-soft dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="th"><span className="sr-only">Cleared</span>✓</th><th className="th">Date</th><th className="th">Payee</th><th className="th">Category</th>
              <th className="th text-right">Outflow</th><th className="th text-right">Inflow</th><th className="th">Who</th><th className="th">Tags</th><th className="th">Receipt</th><th className="th"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr><td colSpan={10} className="td text-slate-500">No transactions yet. Press <span className="kbd">N</span> to add one, or import a CSV.</td></tr>
            )}
            {transactions.map((t) => (
              <tr key={t.id} className={`border-b border-[#E2E8F0] last:border-0 dark:border-slate-800 ${t.clearedStatus === "UNCLEARED" ? "bg-warn-soft/20" : ""}`}>
                <td className="td"><ClearedButton transactionId={t.id} status={t.clearedStatus} /></td>
                <td className="td nums whitespace-nowrap" title={dateToIso(t.date)}>{formatShortDate(t.date)}</td>
                <td className="td">
                  <div className="font-medium">{t.payee?.name ?? <span className="text-slate-400">No payee</span>}</div>
                  {t.memo && <div className="max-w-xs truncate text-xs text-slate-500">{t.memo}</div>}
                </td>
                <td className="td">{t.transferGroupId ? <span className="text-xs font-medium text-slate-500">↔ Transfer</span> : <CategorySelect transactionId={t.id} current={t.categoryId ?? ""} options={catOptions} needsReview={t.needsReview} />}</td>
                <td className="td nums text-right">{t.amountCents < 0 ? formatCents(-t.amountCents) : ""}</td>
                <td className="td nums text-right text-[#2E7D32]">{t.amountCents > 0 ? formatCents(t.amountCents) : ""}</td>
                <td className="td">{people.length > 1 ? <PersonSelect transactionId={t.id} current={t.personId ?? ""} people={people} /> : <span className="text-slate-500">{people[0]?.name}</span>}</td>
                <td className="td">{t.amountCents < 0 && !t.transferGroupId && <TagEditor transactionId={t.id} tags={t.tags} />}</td>
                <td className="td"><ReceiptCell transactionId={t.id} receipt={t.receipt} /></td>
                <td className="td text-right">
                  <div className="flex items-center justify-end gap-1">
                    <EditTransactionButton tx={editable(t)} categories={catOptions} payees={payeeNames} people={people} isBusiness={isBiz} />
                    <form action={deleteTransactionAction}>
                      <input type="hidden" name="transactionId" value={t.id} />
                      <ConfirmDeleteButton />
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {total > LIMIT && <p className="border-t border-[#E2E8F0] px-4 py-2 text-xs text-slate-500 dark:border-slate-800">Showing the latest {LIMIT} of {total} transactions.</p>}
      </section>
    </div>
  );
}
