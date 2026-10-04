import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * A tiny fingerprint of the budget data. Open screens ask for it every few seconds;
 * when it changes (someone else added a transaction, assigned money, edited an account…)
 * they refresh themselves. Counts catch deletions, timestamps/sums catch edits.
 */
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const [tx, split, asg, cat, grp, acct, manual, bill, draw, review] = await Promise.all([
    prisma.transaction.aggregate({ _count: true, _max: { updatedAt: true }, _sum: { amountCents: true } }),
    prisma.transactionSplit.aggregate({ _count: true, _sum: { amountCents: true } }),
    prisma.budgetAssignment.aggregate({ _count: true, _sum: { amountCents: true } }),
    prisma.category.aggregate({ _count: true, _max: { updatedAt: true } }),
    prisma.categoryGroup.aggregate({ _count: true, _max: { updatedAt: true } }),
    prisma.account.aggregate({ _count: true, _max: { updatedAt: true }, _sum: { openingBalanceCents: true } }),
    prisma.manualBalanceEntry.aggregate({ _count: true, _sum: { balanceCents: true } }),
    prisma.billPayment.count(),
    prisma.reserveDraw.aggregate({ _count: true, _sum: { repaidCents: true } }),
    prisma.expenseReview.aggregate({ _count: true, _max: { updatedAt: true } }),
  ]);
  const t = (d: Date | null | undefined) => (d ? d.getTime() : 0);
  const v = [
    tx._count, t(tx._max.updatedAt), tx._sum.amountCents ?? 0,
    split._count, split._sum.amountCents ?? 0,
    asg._count, asg._sum.amountCents ?? 0,
    cat._count, t(cat._max.updatedAt), grp._count, t(grp._max.updatedAt),
    acct._count, t(acct._max.updatedAt), acct._sum.openingBalanceCents ?? 0,
    manual._count, manual._sum.balanceCents ?? 0, bill, draw._count, draw._sum.repaidCents ?? 0, review._count, t(review._max.updatedAt),
  ].join(".");
  return NextResponse.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
