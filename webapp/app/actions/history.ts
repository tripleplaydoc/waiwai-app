"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { isoToDate } from "@/lib/utils/dates";
import { cutoffsFor, getGoLive, getSealedThrough } from "@/lib/history";
import { classifyHistoryRow, isDeductibleType, kindFor } from "@/lib/history-math";
import { isTypeKey } from "@/lib/budget/expense-types";
import type { ActionResult } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const sealMsg = (y: number) => `${y} is sealed. Unseal it on the History page to change it.`;
/** Error text when this year is sealed for the workspace, else null. */
async function sealedError(workspaceId: string, year: number): Promise<string | null> {
  const t = await getSealedThrough(workspaceId);
  return t !== null && year <= t ? sealMsg(year) : null;
}
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
    category: z.string().max(100).optional(),
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

  const sealed = await getSealedThrough(account.workspaceId);
  if (sealed !== null && rows.some((r) => r.date < cutoff && Number(r.date.slice(0, 4)) <= sealed)) return { ok: false, error: `The file has rows from a sealed year (${sealed} and earlier). Unseal it on the History page first, or remove those rows from the file.` };
  const keep = rows.filter((r) => r.date < cutoff);
  const tooLate = rows.length - keep.length;
  if (keep.length === 0) return { ok: false, error: `Every row is dated on or after ${cutoff}, where your live budget begins. History covers only earlier dates.` };

  const seen = new Map<string, number>();
  let classified = 0;
  const data = keep.map((r) => {
    const base = `${accountId}|${r.date}|${r.amountCents}|${r.payee}|${r.memo}`;
    const n = seen.get(base) ?? 0; seen.set(base, n + 1);
    const c = classifyHistoryRow({ payee: r.payee, memo: r.memo, amountCents: r.amountCents, isBusiness, category: r.category });
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
  const sealed = await getSealedThrough(workspaceId);
  const where = { workspaceId, payee, typeKey: null, kind: { not: "TRANSFER" }, ...(sealed !== null ? { date: { gt: isoToDate(`${sealed}-12-31`) } } : {}) } as const;
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
  const ws = await prisma.account.findUnique({ where: { id: accountId }, select: { workspaceId: true } });
  const sealedThrough = ws ? await getSealedThrough(ws.workspaceId) : null;
  if (sealedThrough !== null && (year === null || year <= sealedThrough)) return { ok: false, error: `Years up to ${sealedThrough} are sealed. Unseal them on the History page first.` };
  const range = year ? { date: { gte: isoToDate(`${year}-01-01`), lte: isoToDate(`${year}-12-31`) } } : {};
  const r = await prisma.historicalTransaction.deleteMany({ where: { accountId, ...range } });
  done();
  return { ok: true, message: `Removed ${r.count} history row${r.count === 1 ? "" : "s"}.` };
}

/** Seal every year up to and including `year` (null unseals everything). */
export async function setSealAction(workspaceId: string, year: number | null): Promise<ActionResult> {
  await assertAuthed();
  if (year !== null && (!Number.isInteger(year) || year < 1990 || year > 2100)) return { ok: false, error: "Pick a year." };
  const s = await prisma.historySettings.findUnique({ where: { workspaceId } });
  if (!s) return { ok: false, error: "Set your go-live day first." };
  await prisma.historySettings.update({ where: { workspaceId }, data: { sealedThrough: year } });
  done();
  return { ok: true };
}

/** A bank account that no longer exists, so its old transactions have somewhere to live. It never touches the live budget. */
export async function addClosedAccountAction(workspaceId: string, name: string): Promise<ActionResult> {
  await assertAuthed();
  const n = name.trim().slice(0, 80);
  if (!n) return { ok: false, error: "Give the account a name." };
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
  if (!ws) return { ok: false, error: "Workspace not found." };
  await prisma.account.create({ data: { workspaceId, name: n, type: "CHECKING", onBudget: false, isArchived: true, openingBalanceCents: 0 } });
  done();
  return { ok: true };
}

/** Replace one year's typed-in totals (from a tax return). Blank or zero removes that line. */
export async function saveYearTotalsAction(workspaceId: string, year: number, lines: { typeKey: string; amount: string }[]): Promise<ActionResult> {
  await assertAuthed();
  if (!Number.isInteger(year) || year < 1990 || year > 2100) return { ok: false, error: "Pick a year." };
  const sealed = await sealedError(workspaceId, year);
  if (sealed) return { ok: false, error: sealed };
  const goLive = await getGoLive(workspaceId);
  if (!goLive) return { ok: false, error: "Set your go-live day first." };
  if (year >= Number(goLive.slice(0, 4))) return { ok: false, error: `Totals are for years before your live budget (${goLive.slice(0, 4)}). Use imports or the live budget for ${goLive.slice(0, 4)}.` };
  const clean: { typeKey: string; amountCents: number }[] = [];
  for (const l of lines) {
    if (!isTypeKey(l.typeKey)) return { ok: false, error: "Unknown type." };
    if (l.amount.trim() === "") continue;
    const c = parseToCents(l.amount);
    if (c === null || c < 0) return { ok: false, error: "Enter amounts as positive numbers like 12500.00." };
    if (c > 0) clean.push({ typeKey: l.typeKey, amountCents: c });
  }
  await prisma.$transaction([
    prisma.historyTotal.deleteMany({ where: { workspaceId, year } }),
    prisma.historyTotal.createMany({ data: clean.map((c) => ({ workspaceId, year, ...c })) }),
  ]);
  done();
  return { ok: true, message: clean.length ? `Saved ${clean.length} line${clean.length === 1 ? "" : "s"} for ${year}.` : `Cleared ${year}.` };
}

const rowSchema = z.object({
  accountId: z.string().min(1),
  date: z.string().regex(ISO),
  payee: z.string().trim().max(200),
  memo: z.string().trim().max(500).default(""),
  amount: z.string(),
  direction: z.enum(["out", "in"]),
  typeKey: z.string().max(80).default(""),
});

type RowFields = { ok: false; error: string } | { ok: true; signed: number; kind: ReturnType<typeof classifyHistoryRow> };
async function rowFields(workspaceId: string, d: z.infer<typeof rowSchema>): Promise<RowFields> {
  const cents = parseToCents(d.amount);
  if (cents === null || cents === 0) return { ok: false, error: "Enter an amount like 42.50." };
  const signed = d.direction === "out" ? -Math.abs(cents) : Math.abs(cents);
  const biz = (await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { type: true } }))?.type === "BUSINESS";
  let typeKey: string | null = null, kind = classifyHistoryRow({ payee: d.payee, memo: d.memo, amountCents: signed, isBusiness: biz });
  if (d.typeKey === "TRANSFER") kind = { kind: "TRANSFER", typeKey: null, isTaxDeductible: false };
  else if (d.typeKey) { if (!isTypeKey(d.typeKey)) return { ok: false, error: "Unknown type." }; typeKey = d.typeKey; kind = { kind: kindFor(typeKey, signed), typeKey, isTaxDeductible: kindFor(typeKey, signed) === "EXPENSE" && isDeductibleType(typeKey, biz) }; }
  return { ok: true, signed, kind };
}

/** Add one history row by hand. */
export async function addHistoryRowAction(workspaceId: string, input: unknown): Promise<ActionResult> {
  await assertAuthed();
  const p = rowSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form." };
  const d = p.data;
  const acct = await prisma.account.findFirst({ where: { id: d.accountId, workspaceId }, select: { id: true } });
  if (!acct) return { ok: false, error: "Account not found." };
  const goLive = await getGoLive(workspaceId);
  if (!goLive) return { ok: false, error: "Set your go-live day first." };
  const cutoff = (await cutoffsFor(workspaceId, goLive)).get(d.accountId) ?? goLive;
  if (d.date >= cutoff) return { ok: false, error: `History for this account must end before ${cutoff}.` };
  const sealed = await sealedError(workspaceId, Number(d.date.slice(0, 4)));
  if (sealed) return { ok: false, error: sealed };
  const f = await rowFields(workspaceId, d);
  if (!f.ok) return { ok: false, error: f.error };
  await prisma.historicalTransaction.create({ data: {
    workspaceId, accountId: d.accountId, date: isoToDate(d.date), amountCents: f.signed, payee: d.payee, memo: d.memo,
    kind: f.kind.kind, typeKey: f.kind.typeKey, isTaxDeductible: f.kind.isTaxDeductible,
    importHash: "m|" + createHash("sha256").update(`${Date.now()}|${Math.random()}|${d.accountId}`).digest("hex"), source: "entered by hand",
  } });
  done();
  return { ok: true };
}

/** Edit one history row (date, payee, memo, amount, type). */
export async function updateHistoryRowAction(workspaceId: string, id: string, input: unknown): Promise<ActionResult> {
  await assertAuthed();
  const p = rowSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form." };
  const d = p.data;
  const row = await prisma.historicalTransaction.findFirst({ where: { id, workspaceId } });
  if (!row) return { ok: false, error: "Row not found." };
  for (const y of new Set([row.date.getUTCFullYear(), Number(d.date.slice(0, 4))])) { const e = await sealedError(workspaceId, y); if (e) return { ok: false, error: e }; }
  const goLive = await getGoLive(workspaceId);
  const cutoff = goLive ? (await cutoffsFor(workspaceId, goLive)).get(row.accountId) ?? goLive : null;
  if (cutoff && d.date >= cutoff) return { ok: false, error: `History for this account must end before ${cutoff}.` };
  const f = await rowFields(workspaceId, { ...d, accountId: row.accountId });
  if (!f.ok) return { ok: false, error: f.error };
  await prisma.historicalTransaction.update({ where: { id }, data: { date: isoToDate(d.date), amountCents: f.signed, payee: d.payee, memo: d.memo, kind: f.kind.kind, typeKey: f.kind.typeKey, isTaxDeductible: f.kind.isTaxDeductible } });
  done();
  return { ok: true };
}

export async function deleteHistoryRowAction(workspaceId: string, id: string): Promise<ActionResult> {
  await assertAuthed();
  const row = await prisma.historicalTransaction.findFirst({ where: { id, workspaceId } });
  if (!row) return { ok: false, error: "Row not found." };
  const e = await sealedError(workspaceId, row.date.getUTCFullYear());
  if (e) return { ok: false, error: e };
  await prisma.historicalTransaction.delete({ where: { id } });
  done();
  return { ok: true };
}

export type PayeeRowsResult = { ok: true; total: number; rows: { id: string; date: string; amountCents: number; memo: string; account: string }[] } | { ok: false; error: string };

/** The newest rows behind one "biggest unknown" payee, so you can see what it is before naming it. Read only. */
export async function payeeRowsAction(workspaceId: string, payee: string): Promise<PayeeRowsResult> {
  await assertAuthed();
  const where = { workspaceId, payee, typeKey: null, kind: { not: "TRANSFER" } } as const;
  try {
    const [total, rows] = await Promise.all([
      prisma.historicalTransaction.count({ where }),
      prisma.historicalTransaction.findMany({ where, orderBy: [{ date: "desc" }, { id: "asc" }], take: 12, include: { account: { select: { name: true } } } }),
    ]);
    return { ok: true, total, rows: rows.map((r) => ({ id: r.id, date: r.date.toISOString().slice(0, 10), amountCents: r.amountCents, memo: r.memo, account: r.account.name })) };
  } catch {
    return { ok: false, error: "Could not load those rows." };
  }
}
