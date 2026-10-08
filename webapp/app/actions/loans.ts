"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed, getCurrentUser } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { isoToDate, todayIso } from "@/lib/utils/dates";
import { balanceAfter, loanStatus, paymentsFor, suggestPayment } from "@/lib/loans";
import { holdingOf, holdingSide } from "@/lib/holdings";
import type { ActionResult } from "./types";
import { assertWorkspaceAccess } from "@/lib/workspace";

const schema = z.object({
  workspaceId: z.string().min(1),
  accountId: z.string().optional(),
  name: z.string().trim().min(1, "Name the loan.").max(80),
  original: z.string().optional(),
  /** "start": the loan's original terms. "now": where it stands today (balance owed, payments left, next due date). */
  mode: z.enum(["start", "now"]).default("start"),
  balance: z.string().optional(),
  numPayments: z.string().optional(),
  payment: z.string().optional(),
  firstDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the due date."),
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
  await assertWorkspaceAccess(d.workspaceId);
  const now = d.mode === "now";
  const rateText = (d.rate ?? "").replace(/%/g, "").trim();
  if (rateText !== "" && !(/^\d{1,3}(\.\d{1,2})?$/.test(rateText) && Number(rateText) <= 100)) return { ok: false, error: "Interest rate should look like 6.25 (a yearly percentage). Use 0 for none." };
  const aprBps = rateText === "" ? 0 : Math.round(Number(rateText) * 100);
  const money = (t: string | undefined, label: string): { v: number | null } | { error: string } => {
    if (!t?.trim()) return { v: null };
    const c = parseToCents(t);
    return c === null || c <= 0 ? { error: `${label} should look like 150.00.` } : { v: c };
  };
  const origIn = money(d.original, "Loan amount"), balIn = money(d.balance, "Balance still owed"), payIn = money(d.payment, "Payment");
  for (const r of [origIn, balIn, payIn]) if ("error" in r) return { ok: false, error: r.error };
  const orig = (origIn as { v: number | null }).v, bal = (balIn as { v: number | null }).v;
  let pay = (payIn as { v: number | null }).v;
  const nText = (d.numPayments ?? "").replace(/,/g, "").trim();
  let n = nText === "" ? NaN : Number(nText);
  if (nText !== "" && (!Number.isInteger(n) || n < 1 || n > 600)) return { ok: false, error: now ? "Payments left should be a whole number, like 4." : "Number of payments should be a whole number, like 6 or 12." };
  let originalCents: number;
  if (now) {
    if (bal === null) return { ok: false, error: "Enter the balance still owed." };
    if (pay === null) {
      if (!Number.isFinite(n)) return { ok: false, error: "Enter the payment, or how many payments are left." };
      pay = suggestPayment(bal, n, aprBps);
    }
    if (!Number.isFinite(n)) {
      const est = paymentsFor(bal, pay, aprBps);
      if (est === null || est < 1 || est > 600) return { ok: false, error: "That payment doesn't pay the balance off. Check the payment and rate." };
      n = est;
    }
    originalCents = bal; // the schedule starts from where the loan stands now
  } else {
    if (!Number.isFinite(n)) return { ok: false, error: "Enter the number of payments." };
    if (pay === null) {
      if (orig === null) return { ok: false, error: "Enter the loan amount or the payment amount." };
      pay = suggestPayment(orig, n, aprBps);
    }
    originalCents = orig ?? pay * n;
  }
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
  const startOwed = now ? bal! : balanceAfter(terms, loanStatus(terms, today, false).paymentsDone);

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
      if (now && account.balanceMode === "MANUAL") {
        // "Balance still owed" is the loan's balance in net worth: record it when it differs from what is on file.
        const latest = await tx.manualBalanceEntry.findFirst({ where: { accountId: account.id }, orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }] });
        if (!latest || latest.balanceCents !== -bal!) {
          await tx.manualBalanceEntry.deleteMany({ where: { accountId: account.id, asOfDate: isoToDate(today) } });
          await tx.manualBalanceEntry.create({ data: { accountId: account.id, asOfDate: isoToDate(today), balanceCents: -bal! } });
        }
      }
    }
    const fields = { interestRateBps: aprBps, termMonths: n, originalAmountCents: originalCents, firstPaymentDate: first, dueDay: day };
    await tx.holdingDetail.upsert({ where: { accountId: account.id }, create: { accountId: account.id, loanStartDate: first, ...fields }, update: now ? fields : { ...fields, loanStartDate: first } });

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
  return { ok: true, message: `${d.name}: ${n} payment${n === 1 ? "" : "s"} of ${(pay / 100).toFixed(2)}${now ? " left" : ""}, ${now ? "next" : "first"} due ${d.firstDue}.` };
}

/** Takes a loan's payment off the budget (the loan itself and its terms stay in net worth). */
export async function removeLoanFromBudgetAction(workspaceId: string, accountId: string): Promise<ActionResult> {
  await assertAuthed();
  await assertWorkspaceAccess(workspaceId);
  const pocket = await prisma.category.findFirst({ where: { workspaceId, loanAccountId: accountId } });
  if (!pocket) return { ok: false, error: "That loan isn't on the budget." };
  await prisma.category.update({ where: { id: pocket.id }, data: { isArchived: true, loanAccountId: null } });
  revalidatePath("/budget");
  return { ok: true, message: "Taken off the budget." };
}

/** Records a loan payment: money out of a bank account, counted in the loan's pocket, and the balance owed goes down by the principal part. */
export async function payLoanAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const loan = await prisma.account.findUnique({ where: { id: String(formData.get("loanId") ?? "") }, include: { loanPocket: true, holdingDetail: true } });
  if (loan) await assertWorkspaceAccess(loan.workspaceId);
  if (!loan || loan.type !== "LOAN" || loan.isArchived) return { ok: false, error: "Loan not found." };
  const from = await prisma.account.findUnique({ where: { id: String(formData.get("fromAccountId") ?? "") } });
  if (!from || from.isArchived || from.workspaceId !== loan.workspaceId || from.balanceMode === "MANUAL") return { ok: false, error: "Pick the account you're paying from." };
  const t = String(formData.get("amount") ?? "").trim();
  const cents = t ? parseToCents(t) : null;
  if (cents === null || cents <= 0) return { ok: false, error: "Enter the payment amount, like 250.00." };
  const pt = String(formData.get("principal") ?? "").trim();
  const principal = pt ? parseToCents(pt) : null;
  if (pt && (principal === null || principal < 0 || principal > cents)) return { ok: false, error: "The part that lowers the loan can't be more than the payment." };
  const dateText = String(formData.get("date") ?? "").trim() || todayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return { ok: false, error: "Pick a date." };
  const date = isoToDate(dateText);
  const me = (await getCurrentUser())?.id ?? null;
  const pocket = loan.loanPocket && !loan.loanPocket.isArchived ? loan.loanPocket : null;
  const ops = [
    prisma.transaction.create({ data: { workspaceId: loan.workspaceId, accountId: from.id, date, amountCents: -cents, clearedStatus: "UNCLEARED", needsReview: false, personId: me, categoryId: from.onBudget ? pocket?.id ?? null : null, memo: `Loan payment: ${loan.name}` } }),
  ];
  if (principal && principal > 0) {
    const latest = await prisma.manualBalanceEntry.findFirst({ where: { accountId: loan.id }, orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }] });
    const owed = Math.max(0, -(latest?.balanceCents ?? 0));
    ops.push(prisma.manualBalanceEntry.deleteMany({ where: { accountId: loan.id, asOfDate: date } }) as never);
    ops.push(prisma.manualBalanceEntry.create({ data: { accountId: loan.id, asOfDate: date, balanceCents: -Math.max(0, owed - principal), note: "Payment recorded" } }) as never);
  }
  await prisma.$transaction(ops);
  for (const p of ["/budget", "/accounts", "/holdings", "/reports"]) revalidatePath(p, "layout");
  revalidatePath(`/accounts/${from.id}`);
  return { ok: true, message: "Payment recorded." };
}
