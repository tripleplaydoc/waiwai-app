import "server-only";
import { prisma } from "@/lib/prisma";
import { effectiveType, typeLabel } from "@/lib/budget/expense-types";
import { centsToInput } from "@/lib/utils/currency";
import { dateToIso } from "@/lib/utils/dates";
import { buildPnl } from "./pnl";
import { row, text, usDate } from "./csv";
import { scheduleCFor } from "./schedule-c";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const range = (from: string, to: string) => ({ gte: d(from), lte: d(to) });

/** QuickBooks Online "bank upload" file: Date, Description, Amount (negative = money out). One account per file. */
export async function qboBankCsv(workspaceId: string, accountId: string, from: string, to: string) {
  const txs = await prisma.transaction.findMany({
    where: { workspaceId, accountId, date: range(from, to) },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { payee: true },
  });
  const lines = [row(["Date", "Description", "Amount"])];
  for (const t of txs) {
    const desc = [t.payee?.name, t.memo].filter(Boolean).join(" - ") || "Transaction";
    lines.push(row([usDate(t.date), text(desc), centsToInput(t.amountCents)]));
  }
  return { lines, count: txs.length };
}

/** Every transaction with its pocket, type and Schedule C line (splits become one row each). Opens in Excel, imports to most tax tools. */
export async function fullCsv(workspaceId: string, accountId: string | null, from: string, to: string) {
  const [txs, cats, groups] = await Promise.all([
    prisma.transaction.findMany({
      where: { workspaceId, ...(accountId ? { accountId } : {}), date: range(from, to) },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: { payee: true, account: true, splits: true, receipt: { select: { id: true } } },
    }),
    prisma.category.findMany({ where: { workspaceId } }),
    prisma.categoryGroup.findMany({ where: { workspaceId } }),
  ]);
  const cat = new Map(cats.map((c) => [c.id, c]));
  const grp = new Map(groups.map((g) => [g.id, g.name]));
  const lines = [row(["Date", "Account", "Payee", "Category", "Pocket", "Type", "Schedule C line", "Money in", "Money out", "Amount", "Tax deductible", "Cleared", "Memo", "Has receipt"])];
  for (const t of txs) {
    const parts = t.splits.length > 0
      ? t.splits.map((s) => ({ categoryId: s.categoryId as string | null, cents: s.amountCents, deductible: s.isTaxDeductible, memo: s.memo ?? t.memo }))
      : [{ categoryId: t.categoryId, cents: t.amountCents, deductible: t.isTaxDeductible, memo: t.memo }];
    for (const p of parts) {
      const c = p.categoryId ? cat.get(p.categoryId) : undefined;
      const key = c ? effectiveType(c) : null;
      const sc = c && c.type === "EXPENSE" ? scheduleCFor(key) : null;
      lines.push(row([
        dateToIso(t.date), text(t.account.name), text(t.payee?.name), text(c?.categoryGroupId ? grp.get(c.categoryGroupId) : ""), text(c?.name ?? (t.transferGroupId ? "Transfer" : "Uncategorized")),
        text(typeLabel(key) ?? ""), text(sc ? `Line ${sc.line} ${sc.label}` : ""),
        p.cents > 0 ? centsToInput(p.cents) : "", p.cents < 0 ? centsToInput(-p.cents) : "", centsToInput(p.cents),
        p.deductible ? "Yes" : "No", t.clearedStatus === "UNCLEARED" ? "No" : "Yes", text(p.memo), t.receipt ? "Yes" : "No",
      ]));
    }
  }
  return { lines, count: txs.length };
}

/** Totals by Schedule C line plus the pockets behind each, for filling out the form or handing to a preparer. */
export async function scheduleCCsv(workspaceId: string, from: string, to: string) {
  const r = await buildPnl(workspaceId, { from, to, prevFrom: from, prevTo: from });
  const byLine = new Map<string, { label: string; cents: number; pockets: { name: string; cents: number }[] }>();
  for (const t of r.expenses) {
    const sc = scheduleCFor(t.key);
    const e = byLine.get(sc.line) ?? { label: sc.label, cents: 0, pockets: [] };
    e.cents += t.cents;
    for (const p of t.pockets) e.pockets.push({ name: `${t.label}: ${p.name}`, cents: p.cents });
    byLine.set(sc.line, e);
  }
  const order = (l: string) => parseFloat(l) + (/[a-z]$/.test(l) ? (l.charCodeAt(l.length - 1) - 96) / 100 : 0);
  const lines = [row(["Schedule C line", "Description", "Pocket detail", "Amount"])];
  lines.push(row(["1", text("Gross receipts or sales"), text(""), centsToInput(r.revenueCents)]));
  for (const t of r.revenue) for (const p of t.pockets) lines.push(row(["1", text("Gross receipts or sales"), text(`${t.label}: ${p.name}`), centsToInput(p.cents)]));
  for (const [line, e] of [...byLine.entries()].sort((a, b) => order(a[0]) - order(b[0]))) {
    lines.push(row([line, text(e.label), text(""), centsToInput(e.cents)]));
    for (const p of e.pockets) lines.push(row([line, text(e.label), text(p.name), centsToInput(p.cents)]));
  }
  lines.push(row(["28", text("Total expenses"), text(""), centsToInput(r.expenseCents)]));
  lines.push(row(["31", text("Net profit or loss (line 1 minus line 28)"), text(""), centsToInput(r.netCents)]));
  lines.push("", text("Prepared by WaiWai from your recorded transactions. Planning aid only; confirm line placement (including meals and equipment) with your tax professional."));
  return { lines };
}
