"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { isoToDate } from "@/lib/utils/dates";
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

  let categoryId: string | null = null;
  let deductible = false;
  if (d.categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: d.categoryId, workspaceId: account.workspaceId, isArchived: false } });
    if (!cat) return { ok: false, error: "Category not found in this workspace." };
    categoryId = cat.id;
    deductible = d.deductible === "on" && signed < 0;
  }

  let payeeId: string | null = null;
  if (d.payee) {
    const p = await prisma.payee.upsert({
      where: { workspaceId_name: { workspaceId: account.workspaceId, name: d.payee } },
      update: {},
      create: { workspaceId: account.workspaceId, name: d.payee, defaultCategoryId: categoryId },
    });
    payeeId = p.id;
  }

  await prisma.transaction.create({
    data: {
      workspaceId: account.workspaceId,
      accountId: account.id,
      categoryId,
      payeeId,
      amountCents: signed,
      date: isoToDate(d.date),
      memo: d.memo || null,
      clearedStatus: d.cleared === "on" ? "CLEARED" : "UNCLEARED",
      isTaxDeductible: deductible,
      needsReview: categoryId === null,
    },
  });
  revalidatePath("/budget");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${account.id}`);
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
  await prisma.transaction.delete({ where: { id } });
  revalidatePath("/budget");
  revalidatePath(`/accounts/${tx.accountId}`);
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
 * Imported rows land uncategorized and flagged for review.
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

  const seen = new Map<string, number>();
  const data = rows.map((r) => {
    const key = `${accountId}|${r.date}|${r.amountCents}|${r.payee}|${r.memo}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return {
      key: createHash("sha256").update(`${key}|${n}`).digest("hex"),
      r,
    };
  });

  const batch = await prisma.importBatch.create({
    data: { workspaceId: account.workspaceId, accountId, fileName, rowCount: rows.length },
  });
  try {
    const created = await prisma.transaction.createMany({
      skipDuplicates: true,
      data: data.map(({ key, r }) => ({
        workspaceId: account.workspaceId,
        accountId,
        payeeId: r.payee ? payeeId.get(r.payee) ?? null : null,
        amountCents: r.amountCents,
        date: isoToDate(r.date),
        memo: r.memo || null,
        importBatchId: batch.id,
        importHash: key,
        needsReview: true,
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
