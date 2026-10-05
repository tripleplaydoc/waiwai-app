"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { isoToDate } from "@/lib/utils/dates";
import { cutoffsFor, getGoLive } from "@/lib/history";
import { classifyHistoryRow, isDeductibleType, kindFor } from "@/lib/history-math";
import { isTypeKey } from "@/lib/budget/expense-types";
import type { ActionResult } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const done = () => { revalidatePath("/history"); revalidatePath("/reports"); };

/** The day the live budget began. History must end before it; no history row may sit on or after it. */
export async function setGoLiveAction(workspaceId: string, iso: string): Promise<ActionResult> {
  await assertAuthed();
  if (!ISO.test(iso)) return { ok: false, error: "Pick a date." };
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
  if (!ws) return { ok: false, error: "Workspace not found." };
  const late = await prisma.historicalTransaction.count({ where: { workspaceId, date: { gte: isoToDate(iso) } } });
  if (late > 0) return { ok: false, error: `${late} history row${late === 1 ? " is" : "s are"} dated on or after that day. Remove them first, or pick a later date.` };
  await prisma.historySettings.upsert({ where: { workspaceId }, update: { goLiveDate: isoToDate(iso) }, create: { workspaceId, goLiveDate: isoToDate(iso) } });
  done();
  return { ok: true };
}

/** What the account held when its history begins, so the history can be proven against its opening balance. */
export async function setHistoryStartAction(accountId: string, dateIso: string, balance: string): Promise<ActionResult> {
  await assertAuthed();
  const acct = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true, workspaceId: true } });
  if (!acct) return { ok: false, error: "Account not found." };
  const cents = balance.trim() === "" ? 0 : parseToCents(balance);
  if (cents === null) return { ok: false, error: "Enter the balance like 1250.00 (0 if the account was new)." };
  if (dateIso && !ISO.test(dateIso)) return { ok: false, error: "Pick a valid date." };
  const date = dateIso ? isoToDate(dateIso) : null;
  await prisma.historyAccount.upsert({
    where: { accountId },
    update: { startBalanceCents: cents, startDate: date },
    create: { accountId, workspaceId: acct.workspaceId, startBalanceCents: cents, startDate: date },
  });
  done();
  return { ok: true };
}

const importSchema = z.object({
  accountId: z.string().min(1),
  fileName: z.string().max(255),
  rows: z.array(z.object({
    date: z.string().regex(ISO),
    payee: z.string().max(200),
    memo: z.string().max(500),
    amountCents: z.number().int().min(-2_000_000_000).max(2_000_000_000),
  })).min(1, "Nothing to import").max(20000, "Import at most 20,000 rows at a time"),
});
export type HistoryImportResult =
  | { ok: true; imported: number; duplicates: number; tooLate: number; classified: number; accountId: string }
  | { ok: false; error: string };

/**
 * Stores past-year statement rows in the History layer. They never touch balances, Ready to Assign or pockets.
 * Rows dated on or after the account's cutoff (go-live, or its first live transaction) are left out, and
 * re-importing a file is safe: rows already stored are skipped.
 */
export async function importHistoryAction(input: unknown): Promise<HistoryImportResult> {
  await assertAuthed();
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid import." };
  const { accountId, fileName, rows } = parsed.data;
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, error: "Account not found." };
  const goLive = await getGoLive(account.workspaceId);
  if (!goLive) return { ok: false, error: "Set your go-live date first." };
  const cutoff = (await cutoffsFor(account.workspaceId, goLive)).get(accountId) ?? goLive;
  const isBusiness = (await prisma.workspace.findUnique({ where: { id: account.workspaceId }, select: { type: true } }))?.type === "BUSINESS";

  const keep = rows.filter((r) => r.date < cutoff);
  const tooLate = rows.length - keep.length;
  if (keep.length === 0) return { ok: false, error: `Every row is dated on or after ${cutoff}, where your live budget begins. History covers only earlier dates.` };

  const seen = new Map<string, number>();
  let classified = 0;
  const data = keep.map((r) => {
    const base = `${accountId}|${r.date}|${r.amountCents}|${r.payee}|${r.memo}`;
    const n = seen.get(base) ?? 0; seen.set(base, n + 1);
    const c = classifyHistoryRow({ payee: r.payee, memo: r.memo, amountCents: r.amountCents, isBusiness });
    if (c.typeKey || c.kind === "TRANSFER") classified++;
    return {
      workspaceId: account.workspaceId, accountId, date: isoToDate(r.date), amountCents: r.amountCents,
      payee: r.payee, memo: r.memo, kind: c.kind, typeKey: c.typeKey, isTaxDeductible: c.isTaxDeductible,
      importHash: "h|" + createHash("sha256").update(`${base}|${n}`).digest("hex"), source: fileName.slice(0, 200) || null,
    };
  });
  try {
    let created = 0;
    for (let i = 0; i < data.length; i += 2000) created += (await prisma.historicalTransaction.createMany({ data: data.slice(i, i + 2000), skipDuplicates: true })).count;
    done();
    return { ok: true, imported: created, duplicates: keep.length - created, tooLate, classified, accountId };
  } catch {
    return { ok: false, error: "The import failed and nothing was saved. Try again." };
  }
}

/** Give every unclassified row from one payee a type (or mark them transfers, or clear back to unclassified). */
export async function classifyPayeeAction(workspaceId: string, payee: string, choice: string): Promise<ActionResult> {
  await assertAuthed();
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { type: true } });
  if (!ws) return { ok: false, error: "Workspace not found." };
  const biz = ws.type === "BUSINESS";
  const where = { workspaceId, payee, typeKey: null, kind: { not: "TRANSFER" } } as const;
  if (choice === "TRANSFER") {
    await prisma.historicalTransaction.updateMany({ where, data: { kind: "TRANSFER", isTaxDeductible: false } });
  } else if (isTypeKey(choice)) {
    const k = kindFor(choice, 1);
    await prisma.historicalTransaction.updateMany({ where, data: { typeKey: choice, kind: k, isTaxDeductible: k === "EXPENSE" && isDeductibleType(choice, biz) } });
  } else return { ok: false, error: "Pick a type." };
  done();
  return { ok: true };
}

/** Remove one imported year (or all) for an account so it can be imported again. */
export async function clearHistoryAction(accountId: string, year: number | null): Promise<ActionResult> {
  await assertAuthed();
  const acct = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true } });
  if (!acct) return { ok: false, error: "Account not found." };
  const range = year ? { date: { gte: isoToDate(`${year}-01-01`), lte: isoToDate(`${year}-12-31`) } } : {};
  const r = await prisma.historicalTransaction.deleteMany({ where: { accountId, ...range } });
  done();
  return { ok: true, message: `Removed ${r.count} history row${r.count === 1 ? "" : "s"}.` };
}
