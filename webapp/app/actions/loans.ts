"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { isoToDate, todayIso } from "@/lib/utils/dates";
import { balanceAfter, loanStatus, suggestPayment } from "@/lib/loans";
import { holdingOf, holdingSide } from "@/lib/holdings";
import type { ActionResult } from "./types";

const schema = z.object({
  workspaceId: z.string().min(1),
  accountId: z.string().optional(),
  name: z.string().trim().min(1, "Name the loan.").max(80),
  original: z.string().optional(),
  numPayments: z.string(),
  payment: z.string().optional(),
  firstDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the first payment's due date."),
  rate: z.string().optional(),
  groupId: z.string().optional(),
  paidFromId: z.string().optional(),
  securedById: z.string().optional(),
  pocketId: z.string().optional(),
});

/** Creates a loan (or adds terms to an existing loan account) and puts its payment on the budget as a monthly bill. */
export async function saveLoanAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const p = schema.safeParse(Object.fromEntries(formData));
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form." };
  const d = p.data;
  const n = Number(d.numPayments.replace(/,/g, ""));
  if (!Number.isInteger(n) || n < 1 || n > 600) return { ok: false, error: "Number of payments should be a whole number, like 6 or 12." };
  const rateText = (d.rate ?? "").replace(/%/g, "").trim();
  if (rateText !== "" && !(/^\d{1,3}(\.\d{1,2})?$/.test(rateText) && Number(rateText) <= 100)) return { ok: false, error: "Interest rate should look like 6.25 (a yearly percentage). Use 0 for none." };
  const aprBps = rateText === "" ? 0 : Math.round(Number(rateText) * 100);
  const orig = d.original?.trim() ? parseToCents(d.original) : null;
  if (d.original?.trim() && (orig === null || orig <= 0)) return { ok: false, error: "Loan amount should look like 1200.00." };
  let pay = d.payment?.trim() ? parseToCents(d.payment) : null;
  if (d.payment?.trim() && (pay === null || pay <= 0)) return { ok: false, error: "Payment should look like 150.00." };
  if (pay === null) {
    if (orig === null) return { ok: false, error: "Enter the loan amount or the payment amount." };
    pay = suggestPayment(orig, n, aprBps);
  }
  const originalCents = orig ?? pay * n;
  const first = isoToDate(d.firstDue);
  const workspace = await prisma.workspace.findUnique({ where: { id: d.workspaceId } });
  if (!workspace) return { ok: false, error: "Workspace not found." };

  let account = d.accountId ? await prisma.account.findFirst({ where: { id: d.accountId, workspaceId: d.workspaceId, type: "LOAN", isArchived: false } }) : null;
  if (d.accountId && !account) return { ok: false, error: "Loan not found." };

  let paidFromId: string | null = null;
  if (d.paidFromId) {
    const a = await prisma.account.findFirst({ where: { id: d.paidFromId, workspaceId: d.workspaceId, isArchived: false, onBudget: true } });
    if (!a) return { ok: false, error: "Pick one of your bank accounts to pay from." };
    paidFromId = a.id;
  }

  // An existing pocket to use instead of making a new one (it keeps its name, category and money; only its target and due date follow the loan).
  let chosenPocketId: string | null = null;
  if (d.pocketId) {
    const c = await prisma.category.findFirst({ where: { id: d.pocketId, workspaceId: d.workspaceId, type: "EXPENSE", isArchived: false, isSystemManaged: false } });
    if (!c) return { ok: false, error: "That pocket isn't available." };
    if (c.loanAccountId && c.loanAccountId !== account?.id) return { ok: false, error: `${c.name} already pays another loan.` };
    chosenPocketId = c.id;
  }

  let groupId: string | null = null;
  if (chosenPocketId) {
    // keeps the pocket's own category
  } else if (d.groupId && d.groupId !== "__new") {
    const g = await prisma.categoryGroup.findFirst({ where: { id: d.groupId, workspaceId: d.workspaceId, isArchived: false } });
    if (!g) return { ok: false, error: "Pick a category for the loan." };
    groupId = g.id;
  } else {
    const found = await prisma.categoryGroup.findFirst({ where: { workspaceId: d.workspaceId, isArchived: false, name: "Loans & payments" } });
    if (found) groupId = found.id;
    else {
      const top = await prisma.categoryGroup.aggregate({ where: { workspaceId: d.workspaceId }, _max: { sortOrder: true } });
      groupId = (await prisma.categoryGroup.create({ data: { workspaceId: d.workspaceId, name: "Loans & payments", sortOrder: (top._max.sortOrder ?? 0) + 1 } })).id;
    }
  }

  let securedAssetId: string | null = null;
  if (d.securedById) {
    const asset = await prisma.account.findFirst({ where: { id: d.securedById, workspaceId: d.workspaceId, isArchived: false } });
    if (!asset || holdingSide(holdingOf(asset)) !== "ASSET") return { ok: false, error: "Pick one of your assets (car, home…) to tie this loan to." };
    securedAssetId = asset.id;
  }

  const terms = { paymentCents: pay, numPayments: n, firstDueIso: d.firstDue, aprBps, originalCents };
  const day = +d.firstDue.slice(8, 10);
  const today = todayIso();
  // Money owed on a brand-new loan: what the schedule says is left today (payments due in earlier months count as paid).
  const startOwed = balanceAfter(terms, loanStatus(terms, today, false).paymentsDone);

  const result = await prisma.$transaction(async (tx) => {
    if (!account) {
      account = await tx.account.create({
        data: {
          workspaceId: d.workspaceId, name: d.name, type: "LOAN", onBudget: false, balanceMode: "MANUAL", holdingClass: "BANK_LOAN",
          monthlyCashflowCents: pay, openingBalanceCents: 0,
          manualBalanceEntries: { create: { asOfDate: isoToDate(today), balanceCents: -startOwed } },
        },
      });
    } else {
      await tx.account.update({ where: { id: account.id }, data: { name: d.name, monthlyCashflowCents: pay } });
    }
    const fields = { interestRateBps: aprBps, termMonths: n, originalAmountCents: originalCents, loanStartDate: first, firstPaymentDate: first, dueDay: day };
    await tx.holdingDetail.upsert({ where: { accountId: account.id }, create: { accountId: account.id, ...fields }, update: fields });

    const existing = await tx.category.findUnique({ where: { loanAccountId: account.id } });
    const pocketData = { name: d.name, categoryGroupId: groupId, fundingTargetType: "MONTHLY_FUNDING" as const, fundingTargetCents: pay, dueDay: day, paidFromAccountId: paidFromId, isArchived: false };
    if (chosenPocketId && existing?.id !== chosenPocketId) {
      // Use the pocket you already have. The one made earlier for this loan (if any) is let go.
      if (existing) await tx.category.update({ where: { id: existing.id }, data: { loanAccountId: null, isArchived: true } });
      const keep = await tx.category.findUniqueOrThrow({ where: { id: chosenPocketId } });
      await tx.category.update({ where: { id: chosenPocketId }, data: { loanAccountId: account.id, fundingTargetType: "MONTHLY_FUNDING", fundingTargetCents: pay, dueDay: day, paidFromAccountId: paidFromId ?? keep.paidFromAccountId } });
    } else if (existing) await tx.category.update({ where: { id: existing.id }, data: chosenPocketId ? { fundingTargetType: "MONTHLY_FUNDING", fundingTargetCents: pay, dueDay: day, ...(paidFromId ? { paidFromAccountId: paidFromId } : {}), isArchived: false } : pocketData });
    else {
      const top = await tx.category.aggregate({ where: { workspaceId: d.workspaceId, categoryGroupId: groupId }, _max: { sortOrder: true } });
      await tx.category.create({ data: { workspaceId: d.workspaceId, type: "EXPENSE", loanAccountId: account.id, sortOrder: (top._max.sortOrder ?? 0) + 1, ...pocketData } });
    }
    // Tie the loan to the asset it is secured by: the asset's detail points at the loan (equity = value − owed).
    await tx.holdingDetail.updateMany({ where: { linkedLoanId: account.id, ...(securedAssetId ? { accountId: { not: securedAssetId } } : {}) }, data: { linkedLoanId: null } });
    if (securedAssetId) await tx.holdingDetail.upsert({ where: { accountId: securedAssetId }, create: { accountId: securedAssetId, linkedLoanId: account.id }, update: { linkedLoanId: account.id } });
    return account.id;
  });
  void result;
  revalidatePath("/budget");
  revalidatePath("/holdings");
  revalidatePath("/accounts", "layout");
  revalidatePath("/reports");
  return { ok: true, message: `${d.name}: ${n} payments of ${(pay / 100).toFixed(2)}, first due ${d.firstDue}.` };
}

/** Takes a loan's payment off the budget (the loan itself and its terms stay in net worth). */
export async function removeLoanFromBudgetAction(workspaceId: string, accountId: string): Promise<ActionResult> {
  await assertAuthed();
  const pocket = await prisma.category.findFirst({ where: { workspaceId, loanAccountId: accountId } });
  if (!pocket) return { ok: false, error: "That loan isn't on the budget." };
  await prisma.category.update({ where: { id: pocket.id }, data: { isArchived: true, loanAccountId: null } });
  revalidatePath("/budget");
  return { ok: true, message: "Taken off the budget." };
}
