"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { dateToIso, isoToDate, todayIso } from "@/lib/utils/dates";
import { UNACCOUNTED } from "@/lib/budget/expense-types";
import { diagnoseGap, type Diagnosis } from "@/lib/proof-math";

const LIABILITY = new Set(["CREDIT_CARD", "LOAN", "OTHER_LIABILITY"]);

export type CheckResult =
  | { ok: false; error: string }
  | { ok: true; checkpointId: string; appCents: number; bankCents: number; diagnosis: Diagnosis; onBudget: boolean };

const checkSchema = z.object({
  accountId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string(),
});

/** Compare one account to the bank balance the person typed, save the checkpoint, and say what the gap looks like. */
export async function checkBalanceAction(input: { accountId: string; date: string; amount: string }): Promise<CheckResult> {
  await assertAuthed();
  const d = checkSchema.safeParse(input);
  if (!d.success) return { ok: false, error: "Pick the account, a date, and type the balance your bank shows." };
  if (d.data.date > todayIso()) return { ok: false, error: "That date is in the future." };
  const typed = parseToCents(d.data.amount);
  if (typed === null) return { ok: false, error: "Type the balance as a number, like 1,234.56." };
  const account = await prisma.account.findUnique({ where: { id: d.data.accountId } });
  if (!account) return { ok: false, error: "Account not found." };
  await assertWorkspaceAccess(account.workspaceId);
  if (account.balanceMode !== "TRANSACTION_DERIVED") return { ok: false, error: "This account's balance is entered by hand, so there is nothing to compare." };
  // Cards and loans: people read "amount owed" off the bank, which the app stores as a negative balance.
  const bankCents = LIABILITY.has(account.type) ? -typed : typed;
  const upTo = isoToDate(d.data.date);
  const sum = await prisma.transaction.aggregate({ where: { accountId: account.id, date: { lte: upTo } }, _sum: { amountCents: true } });
  const appCents = account.openingBalanceCents + (sum._sum.amountCents ?? 0);

  const since = new Date(upTo.getTime() - 45 * 86400000);
  const rows = await prisma.transaction.findMany({
    where: { accountId: account.id, date: { lte: upTo }, OR: [{ date: { gte: since } }, { clearedStatus: "UNCLEARED" }] },
    select: { id: true, date: true, amountCents: true, clearedStatus: true, payee: { select: { name: true } }, memo: true },
    orderBy: { date: "desc" }, take: 400,
  });
  const diagnosis = diagnoseGap({
    bankCents, appCents, today: d.data.date,
    txs: rows.map((t) => ({ id: t.id, date: dateToIso(t.date), amountCents: t.amountCents, payee: t.payee?.name ?? t.memo ?? "", cleared: t.clearedStatus !== "UNCLEARED" })),
  });
  const cp = await prisma.balanceCheckpoint.create({
    data: { workspaceId: account.workspaceId, accountId: account.id, date: upTo, bankCents, appCents, gapCents: diagnosis.gapCents, adjustedCents: diagnosis.state === "pending" ? diagnosis.gapCents : 0 },
  });
  revalidatePath("/accounts", "layout");
  return { ok: true, checkpointId: cp.id, appCents, bankCents, diagnosis, onBudget: account.onBudget };
}

/** The pocket that holds differences nobody has explained yet; created on first use. */
async function unaccountedPocket(workspaceId: string): Promise<string> {
  const have = await prisma.category.findFirst({ where: { workspaceId, expenseType: UNACCOUNTED, isArchived: false }, select: { id: true } });
  if (have) return have.id;
  let group = await prisma.categoryGroup.findFirst({ where: { workspaceId, name: "Reconciliation" }, select: { id: true } });
  if (!group) {
    const top = await prisma.categoryGroup.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
    group = await prisma.categoryGroup.create({ data: { workspaceId, name: "Reconciliation", sortOrder: (top._max.sortOrder ?? 0) + 1 }, select: { id: true } });
  }
  return (await prisma.category.create({ data: { workspaceId, categoryGroupId: group.id, name: "Unaccounted", type: "EXPENSE", expenseType: UNACCOUNTED, isTaxDeductible: false } })).id;
}

/** Post the gap as an adjustment so the app matches the bank, parked in the Unaccounted pocket until it is explained. */
export async function parkUnaccountedAction(checkpointId: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await assertAuthed();
  const cp = await prisma.balanceCheckpoint.findUnique({ where: { id: checkpointId }, include: { account: true } });
  if (!cp) return { ok: false, error: "That check was not found." };
  await assertWorkspaceAccess(cp.workspaceId);
  const gap = cp.gapCents - cp.adjustedCents;
  if (gap === 0) return { ok: true, message: "Nothing to park." };
  const onBudget = cp.account.onBudget;
  const categoryId = onBudget ? await unaccountedPocket(cp.workspaceId) : null;
  const payee = await prisma.payee.upsert({
    where: { workspaceId_name: { workspaceId: cp.workspaceId, name: "Balance adjustment" } },
    update: {}, create: { workspaceId: cp.workspaceId, name: "Balance adjustment" },
  });
  await prisma.transaction.create({
    data: {
      workspaceId: cp.workspaceId, accountId: cp.accountId, categoryId, payeeId: payee.id,
      amountCents: gap, date: cp.date, memo: "Balance adjustment to match the bank. Explain it when you find the cause.",
      clearedStatus: "CLEARED", isTaxDeductible: false, needsReview: false,
    },
  });
  await prisma.balanceCheckpoint.update({ where: { id: cp.id }, data: { adjustedCents: cp.gapCents } });
  revalidatePath("/budget"); revalidatePath("/accounts", "layout"); revalidatePath("/reports");
  return { ok: true, message: onBudget ? "Posted. The difference now sits in the Unaccounted pocket." : "Posted. The account now matches the bank." };
}
