import Link from "next/link";
import { notFound } from "next/navigation";
import { Upload } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/utils/currency";
import { dateToIso, formatShortDate, todayIso } from "@/lib/utils/dates";
import { deleteTransactionAction } from "@/app/actions/transactions";
import { AddTransactionButton, CategorySelect, ConfirmDeleteButton, ReceiptCell } from "./transaction-controls";

export const dynamic = "force-dynamic";
const LIMIT = 300;

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const account = await prisma.account.findUnique({ where: { id }, include: { workspace: true } });
  if (!account) notFound();

  const [transactions, sum, categories, groups, payees] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId: id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: LIMIT,
      include: { payee: true, receipt: { select: { id: true, fileName: true } } },
    }),
    prisma.transaction.aggregate({ where: { accountId: id }, _sum: { amountCents: true } }),
    prisma.category.findMany({ where: { workspaceId: account.workspaceId, isArchived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.categoryGroup.findMany({ where: { workspaceId: account.workspaceId, isArchived: false } }),
    prisma.payee.findMany({ where: { workspaceId: account.workspaceId, isArchived: false }, orderBy: { name: "asc" }, take: 500 }),
  ]);
  const total = await prisma.transaction.count({ where: { accountId: id } });
  const balance = account.openingBalanceCents + (sum._sum.amountCents ?? 0);
  const wsQ = account.workspace.type === "BUSINESS" ? "?ws=business" : "";
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const catOptions = categories.map((c) => ({ id: c.id, name: c.name, group: c.categoryGroupId ? groupName.get(c.categoryGroupId) ?? "Other" : "Other", type: c.type }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <Link href={`/accounts${wsQ}`} className="text-xs text-slate-500 hover:underline">← All accounts</Link>
          <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
        </div>
        <div className={`nums text-2xl font-semibold ${balance < 0 ? "text-[#C9372C]" : "text-[#2E7D32]"}`}>{formatCents(balance)}</div>
        <div className="ml-auto flex gap-2">
          <Link href={`/import${wsQ}${wsQ ? "&" : "?"}account=${account.id}`} className="btn"><Upload className="size-4" aria-hidden /> Import CSV</Link>
          <AddTransactionButton
            accountId={account.id}
            isBusiness={account.workspace.type === "BUSINESS"}
            categories={catOptions}
            payees={payees.map((p) => p.name)}
            today={todayIso()}
          />
        </div>
      </div>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead className="border-b border-[#E2E8F0] bg-navy-soft dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="th">Date</th><th className="th">Payee</th><th className="th">Category</th>
              <th className="th text-right">Outflow</th><th className="th text-right">Inflow</th><th className="th">Receipt</th><th className="th"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr><td colSpan={7} className="td text-slate-500">No transactions yet. Press <span className="kbd">N</span> to add one, or import a CSV.</td></tr>
            )}
            {transactions.map((t) => (
              <tr key={t.id} className="border-b border-[#E2E8F0] last:border-0 dark:border-slate-800">
                <td className="td nums whitespace-nowrap" title={dateToIso(t.date)}>{formatShortDate(t.date)}</td>
                <td className="td">
                  <div className="font-medium">{t.payee?.name ?? <span className="text-slate-400">No payee</span>}</div>
                  {t.memo && <div className="max-w-xs truncate text-xs text-slate-500">{t.memo}</div>}
                </td>
                <td className="td"><CategorySelect transactionId={t.id} current={t.categoryId ?? ""} options={catOptions} needsReview={t.needsReview} /></td>
                <td className="td nums text-right">{t.amountCents < 0 ? formatCents(-t.amountCents) : ""}</td>
                <td className="td nums text-right text-[#2E7D32]">{t.amountCents > 0 ? formatCents(t.amountCents) : ""}</td>
                <td className="td"><ReceiptCell transactionId={t.id} receipt={t.receipt} /></td>
                <td className="td text-right">
                  <form action={deleteTransactionAction}>
                    <input type="hidden" name="transactionId" value={t.id} />
                    <ConfirmDeleteButton />
                  </form>
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
