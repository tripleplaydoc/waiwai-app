"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed, getCurrentUser } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { isoToDate } from "@/lib/utils/dates";
import { readReceipt, saveReceipt } from "@/lib/receipts";
import { parseTags } from "@/lib/budget/expense-tags";
import { MIXED_USE_TYPES, OWNER_DRAW, effectiveType } from "@/lib/budget/expense-types";
import { isFrequency, nextOccurrence } from "@/lib/recurring-math";
import type { ActionResult } from "./types";

const txSchema = z.object({
  accountId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  payee: z.string().trim().max(200).optional(),
  categoryId: z.string().optional(),
  memo: z.string().trim().max(500).optional(),
  direction: z.enum(["outflow", "inflow"]),
  amount: z.string(),
  cleared: z.string().optional(),
  deductible: z.string().optional(),
  personId: z.string().optional(),
  /** Business use % (1-100) for mixed-use costs; the rest is personal. */
  bizPct: z.string().optional(),
  /** Meals: who/what the meal was for, kept with the transaction. */
  purpose: z.string().trim().max(200).optional(),
  /** Repeat this transaction on a schedule (WEEKLY | BIWEEKLY | MONTHLY | QUARTERLY | YEARLY); empty = just once. */
  repeat: z.string().optional(),
});

export async function createTransactionAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const parsed = txSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;

  const cents = parseToCents(d.amount);
  if (cents === null || cents === 0) return { ok: false, error: "Enter an amount like 42.50" };
  const signed = d.direction === "outflow" ? -Math.abs(cents) : Math.abs(cents);

  const account = await prisma.account.findUnique({ where: { id: d.accountId } });
  if (!account || account.isArchived) return { ok: false, error: "Account not found." };

  let personId: string | null = (await getCurrentUser())?.id ?? null;
  if (d.personId) {
    const person = await prisma.user.findUnique({ where: { id: d.personId }, select: { id: true } });
    if (!person) return { ok: false, error: "That person wasn't found." };
    personId = person.id;
  }

  const rec = await readReceipt(formData);
  if ("error" in rec) return { ok: false, error: rec.error };

  let categoryId: string | null = null;
  let deductible = false;
  let chosenType: string | null = null;
  if (d.categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: d.categoryId, workspaceId: account.workspaceId, isArchived: false } });
    if (!cat) return { ok: false, error: "Category not found in this workspace." };
    categoryId = cat.id;
    chosenType = effectiveType(cat);
    deductible = d.deductible === "on" && signed < 0;
  }

  // Business-use share for mixed-use costs: the business part stays in the chosen pocket, the rest goes to Owner's draw.
  let memo = d.memo || "";
  let personalCents = 0;
  const wsRow = await prisma.workspace.findUnique({ where: { id: account.workspaceId }, select: { type: true } });
  const pct = d.bizPct ? Math.round(Number(d.bizPct)) : 100;
  if (d.bizPct && (!Number.isFinite(pct) || pct < 1 || pct > 100)) return { ok: false, error: "Business use must be between 1 and 100%." };
  if (wsRow?.type === "BUSINESS" && signed < 0 && categoryId && chosenType && MIXED_USE_TYPES.includes(chosenType) && pct < 100) {
    personalCents = Math.round((Math.abs(signed) * (100 - pct)) / 100);
    memo = `${memo ? memo + " " : ""}(${pct}% business)`.slice(0, 500);
  }
  if (wsRow?.type === "BUSINESS" && signed < 0 && chosenType === "MEALS" && d.purpose) memo = `${memo ? memo + " " : ""}(Business purpose: ${d.purpose})`.slice(0, 500);

  let payeeId: string | null = null;
  if (d.payee) {
    const p = await prisma.payee.upsert({
      where: { workspaceId_name: { workspaceId: account.workspaceId, name: d.payee } },
      update: {},
      create: { workspaceId: account.workspaceId, name: d.payee, defaultCategoryId: categoryId },
    });
    payeeId = p.id;
  }

  const created = await prisma.transaction.create({
    data: {
      workspaceId: account.workspaceId,
      accountId: account.id,
      categoryId,
      payeeId,
      amountCents: signed,
      date: isoToDate(d.date),
      memo: memo || null,
      clearedStatus: d.cleared === "on" ? "CLEARED" : "UNCLEARED",
      isTaxDeductible: deductible,
      needsReview: categoryId === null,
      personId,
      tags: parseTags(formData.getAll("tags")),
    },
  });
  if (personalCents > 0 && categoryId) {
    const draw = await ownerDrawPocket(account.workspaceId);
    await prisma.transactionSplit.createMany({ data: [
      { transactionId: created.id, categoryId, amountCents: signed + personalCents, memo: "Business part", isTaxDeductible: deductible },
      { transactionId: created.id, categoryId: draw, amountCents: -personalCents, memo: "Personal part", isTaxDeductible: false },
    ] });
  }
  if (rec.input) await saveReceipt(prisma, account.workspaceId, created.id, rec.input);
  // "Repeat": set up the schedule from the next date on (this one is already posted).
  if (d.repeat && isFrequency(d.repeat)) {
    try {
      await prisma.recurringItem.create({ data: {
        workspaceId: account.workspaceId, accountId: account.id, categoryId, payee: d.payee || memo || "Recurring", memo: d.memo || null, amountCents: signed,
        frequency: d.repeat, nextDate: isoToDate(nextOccurrence(d.date, d.repeat, +d.date.slice(8, 10))), anchorDay: +d.date.slice(8, 10), isDeductible: deductible,
      } });
      revalidatePath("/recurring");
    } catch { /* recurring table not created yet: the transaction itself is saved */ }
  }
  revalidatePath("/budget");
  revalidatePath("/accounts", "layout");
  return { ok: true };
}

/** The pocket that holds the personal share of mixed-use purchases; created on first use. */
async function ownerDrawPocket(workspaceId: string): Promise<string> {
  const have = await prisma.category.findFirst({ where: { workspaceId, expenseType: OWNER_DRAW, isArchived: false }, select: { id: true } });
  if (have) return have.id;
  let group = await prisma.categoryGroup.findFirst({ where: { workspaceId, name: "Owner" }, select: { id: true } });
  if (!group) {
    const top = await prisma.categoryGroup.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
    group = await prisma.categoryGroup.create({ data: { workspaceId, name: "Owner", sortOrder: (top._max.sortOrder ?? 0) + 1 }, select: { id: true } });
  }
  return (await prisma.category.create({ data: { workspaceId, categoryGroupId: group.id, name: "Owner\u2019s draw (personal use)", type: "EXPENSE", expenseType: OWNER_DRAW, isTaxDeductible: false } })).id;
}

export async function setTransactionTagsAction(transactionId: string, tags: string[]): Promise<ActionResult> {
  await assertAuthed();
  const tx = await prisma.transaction.findUnique({ where: { id: transactionId }, select: { id: true, accountId: true } });
  if (!tx) return { ok: false, error: "Transaction not found." };
  await prisma.transaction.update({ where: { id: tx.id }, data: { tags: parseTags(tags) } });
  revalidatePath(`/accounts/${tx.accountId}`);
  revalidatePath("/reports");
  return { ok: true };
}

export async function setTransactionCategoryAction(formData: FormData): Promise<void> {
  await assertAuthed();
  const id = z.string().min(1).parse(formData.get("transactionId"));
  const categoryRaw = String(formData.get("categoryId") ?? "");
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx) return;
  let categoryId: string | null = null;
  if (categoryRaw) {
    const cat = await prisma.category.findFirst({ where: { id: categoryRaw, workspaceId: tx.workspaceId, isArchived: false } });
    if (!cat) return;
    categoryId = cat.id;
  }
  await prisma.transaction.update({ where: { id }, data: { categoryId, needsReview: categoryId === null } });
  revalidatePath("/budget");
  revalidatePath(`/accounts/${tx.accountId}`);
}

export async function deleteTransactionAction(formData: FormData): Promise<void> {
  await assertAuthed();
  const id = z.string().min(1).parse(formData.get("transactionId"));
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx) return;
  // A transfer (like a card payment) has two halves; removing one removes both so the books stay balanced.
  const halves = tx.transferGroupId ? await prisma.transaction.findMany({ where: { transferGroupId: tx.transferGroupId }, select: { id: true, accountId: true } }) : [];
  await prisma.transaction.deleteMany({ where: { id: { in: halves.length ? halves.map((h) => h.id) : [id] } } });
  revalidatePath("/budget");
  revalidatePath(`/accounts/${tx.accountId}`);
  for (const h of halves) revalidatePath(`/accounts/${h.accountId}`);
}

const importSchema = z.object({
  accountId: z.string().min(1),
  fileName: z.string().max(255),
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        payee: z.string().max(200),
        memo: z.string().max(500),
        amountCents: z.number().int().min(-2_000_000_000).max(2_000_000_000),
        /** Optional pocket chosen (or suggested) for this row. */
        categoryId: z.string().max(64).nullable().optional(),
      })
    )
    .min(1, "Nothing to import")
    .max(5000, "Import at most 5,000 rows at a time"),
});

export type ImportResult = { ok: true; imported: number; duplicates: number; accountId: string } | { ok: false; error: string };

/**
 * Commits previewed CSV rows. Re-importing the same statement is safe: each
 * row gets a hash of (account, date, amount, payee, memo, occurrence number)
 * and the database's unique index on (accountId, importHash) skips repeats.
 * Rows land flagged for review unless a pocket was chosen for them (suggested pockets the user accepted).
 */
export async function importTransactionsAction(input: unknown): Promise<ImportResult> {
  await assertAuthed();
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid import." };
  const { accountId, fileName, rows } = parsed.data;

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || account.isArchived) return { ok: false, error: "Account not found." };

  const names = [...new Set(rows.map((r) => r.payee).filter(Boolean))];
  if (names.length) {
    await prisma.payee.createMany({
      data: names.map((name) => ({ workspaceId: account.workspaceId, name })),
      skipDuplicates: true,
    });
  }
  const payees = await prisma.payee.findMany({ where: { workspaceId: account.workspaceId, name: { in: names } } });
  const payeeId = new Map(payees.map((p) => [p.name, p.id]));

  const wanted = [...new Set(rows.map((r) => r.categoryId).filter((x): x is string => !!x))];
  const cats = wanted.length ? await prisma.category.findMany({ where: { id: { in: wanted }, workspaceId: account.workspaceId, isArchived: false, isSystemManaged: false } }) : [];
  const catById = new Map(cats.map((c) => [c.id, c]));
  const isBiz = (await prisma.workspace.findUnique({ where: { id: account.workspaceId }, select: { type: true } }))?.type === "BUSINESS";

  const seen = new Map<string, number>();
  const data = rows.map((r) => {
    const key = `${accountId}|${r.date}|${r.amountCents}|${r.payee}|${r.memo}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const cat = r.categoryId ? catById.get(r.categoryId) ?? null : null;
    return {
      key: createHash("sha256").update(`${key}|${n}`).digest("hex"),
      r,
      cat,
    };
  });

  const importer = await getCurrentUser();
  const batch = await prisma.importBatch.create({
    data: { workspaceId: account.workspaceId, accountId, fileName, rowCount: rows.length },
  });
  try {
    const created = await prisma.transaction.createMany({
      skipDuplicates: true,
      data: data.map(({ key, r, cat }) => ({
        workspaceId: account.workspaceId,
        accountId,
        payeeId: r.payee ? payeeId.get(r.payee) ?? null : null,
        amountCents: r.amountCents,
        date: isoToDate(r.date),
        memo: r.memo || null,
        importBatchId: batch.id,
        personId: importer?.id ?? null,
        importHash: key,
        categoryId: cat?.id ?? null,
        isTaxDeductible: !!cat && isBiz && cat.isTaxDeductible && r.amountCents < 0,
        needsReview: !cat,
      })),
    });
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: "COMPLETED", importedRowCount: created.count, duplicateRowCount: rows.length - created.count },
    });
    revalidatePath("/budget");
    revalidatePath(`/accounts/${accountId}`);
    return { ok: true, imported: created.count, duplicates: rows.length - created.count, accountId };
  } catch {
    await prisma.importBatch.update({ where: { id: batch.id }, data: { status: "FAILED" } });
    return { ok: false, error: "The import failed and nothing was saved. Try again." };
  }
}

/** Attaches (or replaces) the receipt on an existing transaction. */
export async function attachReceiptAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const id = z.string().min(1).safeParse(formData.get("transactionId"));
  if (!id.success) return { ok: false, error: "Bad request." };
  const tx = await prisma.transaction.findUnique({ where: { id: id.data } });
  if (!tx) return { ok: false, error: "Transaction not found." };
  const rec = await readReceipt(formData);
  if ("error" in rec) return { ok: false, error: rec.error };
  if (!rec.input) return { ok: false, error: "Choose a photo or PDF first." };
  await saveReceipt(prisma, tx.workspaceId, tx.id, rec.input);
  revalidatePath(`/accounts/${tx.accountId}`);
  return { ok: true };
}

export async function removeReceiptAction(formData: FormData): Promise<void> {
  await assertAuthed();
  const id = z.string().min(1).parse(formData.get("transactionId"));
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx) return;
  await prisma.receipt.deleteMany({ where: { transactionId: id } });
  revalidatePath(`/accounts/${tx.accountId}`);
}

export async function setTransactionPersonAction(formData: FormData): Promise<void> {
  await assertAuthed();
  const id = z.string().min(1).parse(formData.get("transactionId"));
  const raw = String(formData.get("personId") ?? "");
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx) return;
  let personId: string | null = null;
  if (raw) {
    const p = await prisma.user.findUnique({ where: { id: raw }, select: { id: true } });
    if (!p) return;
    personId = p.id;
  }
  await prisma.transaction.update({ where: { id }, data: { personId } });
  revalidatePath("/accounts", "layout");
  revalidatePath("/reports");
}
