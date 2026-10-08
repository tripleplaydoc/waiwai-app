"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { assertAuthed, getCurrentUser } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { isoToDate } from "@/lib/utils/dates";
import { HOLDING_DEFS, isHoldingKey, type HoldingKey } from "@/lib/holdings";
import type { ActionResult } from "./types";

const schema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(80),
  type: z.enum(["CHECKING", "SAVINGS", "CREDIT_CARD", "CASH", "INVESTMENT", "LOAN", "PROPERTY", "OTHER_ASSET", "OTHER_LIABILITY"]),
  opening: z.string().optional(),
  openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  stewardId: z.string().optional(),
});

/** The household member chosen as steward (blank = you). Returns null for "no steward". */
async function resolveSteward(raw: string | undefined, fallbackToMe: boolean): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  if (raw === undefined || raw === "") {
    if (!fallbackToMe) return { ok: true, id: null };
    return { ok: true, id: (await getCurrentUser())?.id ?? null };
  }
  const u = await prisma.user.findUnique({ where: { id: raw }, select: { id: true } });
  return u ? { ok: true, id: u.id } : { ok: false, error: "Pick one of the household members as steward." };
}

const OFF_BUDGET = new Set(["INVESTMENT", "LOAN", "PROPERTY", "OTHER_ASSET", "OTHER_LIABILITY"]);

export async function createAccountAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  await assertWorkspaceAccess(d.workspaceId);

  let opening = 0;
  if (d.opening && d.opening.trim() !== "") {
    const c = parseToCents(d.opening);
    if (c === null) return { ok: false, error: "Opening balance must be an amount like 1250.00 (use a minus sign for a debt)." };
    opening = d.type === "CREDIT_CARD" && c > 0 ? -c : c; // for a card, a plain number is what you owe
  }
  const ws = await prisma.workspace.findUnique({ where: { id: d.workspaceId } });
  if (!ws) return { ok: false, error: "Workspace not found." };
  const steward = await resolveSteward(d.stewardId, true);
  if (!steward.ok) return steward;

  await prisma.account.create({
    data: {
      workspaceId: d.workspaceId,
      name: d.name,
      type: d.type,
      onBudget: !OFF_BUDGET.has(d.type),
      openingBalanceCents: opening,
      openingBalanceDate: d.openingDate ? isoToDate(d.openingDate) : null,
      stewardId: steward.id,
    },
  });
  revalidatePath("/accounts");
  revalidatePath("/budget");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

const editSchema = schema.omit({ workspaceId: true }).extend({
  accountId: z.string().min(1),
  holdingClass: z.string().optional(),
  monthly: z.string().optional(),
});

/** Change an account's name, type, starting balance or the date that balance is from. Transactions are never touched. */
export async function updateAccountAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  const account = await prisma.account.findUnique({ where: { id: d.accountId } });
  if (!account) return { ok: false, error: "Account not found." };
  await assertWorkspaceAccess(account.workspaceId);

  let opening = account.openingBalanceCents;
  if (d.opening !== undefined) {
    if (d.opening.trim() === "") opening = 0;
    else {
      const c = parseToCents(d.opening);
      if (c === null) return { ok: false, error: "Starting balance must be an amount like 1250.00 (use a minus sign for a debt)." };
      opening = d.type === "CREDIT_CARD" && c > 0 ? -c : c; // for a card, a plain number is what you owe
    }
  }
  let monthly: number | null | undefined;
  if (d.monthly !== undefined) {
    if (d.monthly.trim() === "") monthly = null;
    else {
      const c = parseToCents(d.monthly);
      if (c === null || c < 0) return { ok: false, error: "Monthly amount must be a positive amount like 450.00." };
      monthly = c;
    }
  }
  const holdingClass = d.holdingClass && isHoldingKey(d.holdingClass) ? d.holdingClass : null;
  const steward = d.stewardId === undefined ? null : await resolveSteward(d.stewardId, false);
  if (steward && !steward.ok) return steward;
  await prisma.account.update({
    where: { id: account.id },
    data: {
      name: d.name,
      type: d.type,
      onBudget: !OFF_BUDGET.has(d.type),
      openingBalanceCents: opening,
      openingBalanceDate: d.openingDate ? isoToDate(d.openingDate) : account.openingBalanceDate,
      ...(steward ? { stewardId: steward.id } : {}),
      ...(d.holdingClass !== undefined ? { holdingClass } : {}),
      ...(monthly !== undefined ? { monthlyCashflowCents: monthly } : {}),
    },
  });
  revalidatePath("/accounts", "layout");
  revalidatePath("/budget");
  revalidatePath("/holdings");
  revalidatePath("/reports");
  return { ok: true, message: "Account updated." };
}

// ---------------------------------------------------------------------------
// Assets & liabilities (valued by hand, with a history of values)
// ---------------------------------------------------------------------------

const holdingSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(80),
  cls: z.string().refine(isHoldingKey, "Pick what this is."),
  value: z.string(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  monthly: z.string().optional(),
});

function parseMoney(t: string | undefined, label: string): { cents: number | null } | { error: string } {
  if (t === undefined || t.trim() === "") return { cents: null };
  const c = parseToCents(t);
  if (c === null || c < 0) return { error: `${label} must be an amount like 450.00.` };
  return { cents: c };
}

export async function createHoldingAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const p = holdingSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form." };
  const d = p.data;
  await assertWorkspaceAccess(d.workspaceId);
  const cls = d.cls as HoldingKey;
  const value = parseMoney(d.value, "Value"), monthly = parseMoney(d.monthly, "Monthly amount");
  if ("error" in value) return { ok: false, error: value.error };
  if ("error" in monthly) return { ok: false, error: monthly.error };
  // Coins and shares are valued from their positions (added next), so these two can start at zero.
  const priced = cls === "CRYPTO" || cls === "STOCKS_FUNDS";
  if (value.cents === null && !priced) return { ok: false, error: "Enter what it's worth (or what you owe)." };
  const startCents = value.cents ?? 0;
  const ws = await prisma.workspace.findUnique({ where: { id: d.workspaceId } });
  if (!ws) return { ok: false, error: "Workspace not found." };
  const def = HOLDING_DEFS.find((h) => h.key === cls)!;
  const signed = def.side === "ASSET" ? startCents : -startCents;
  await prisma.account.create({
    data: {
      workspaceId: d.workspaceId, name: d.name, type: def.accountType, onBudget: false, balanceMode: "MANUAL", holdingClass: cls,
      monthlyCashflowCents: monthly.cents, openingBalanceCents: 0,
      manualBalanceEntries: { create: { asOfDate: isoToDate(d.asOf), balanceCents: signed } },
    },
  });
  revalidatePath("/holdings");
  revalidatePath("/accounts");
  revalidatePath("/reports");
  return { ok: true };
}

/** Edit a hand-valued holding: name, class, monthly income/payment, and (optionally) a new value as of a date. */
export async function updateHoldingAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const id = z.string().min(1).safeParse(formData.get("accountId"));
  const p = holdingSchema.omit({ workspaceId: true }).safeParse(Object.fromEntries(formData));
  if (!id.success || !p.success) return { ok: false, error: p.success ? "Bad request." : p.error.issues[0]?.message ?? "Check the form." };
  const d = p.data;
  const cls = d.cls as HoldingKey;
  const value = parseMoney(d.value, "Value"), monthly = parseMoney(d.monthly, "Monthly amount");
  if ("error" in value) return { ok: false, error: value.error };
  if ("error" in monthly) return { ok: false, error: monthly.error };
  const acct = await prisma.account.findUnique({ where: { id: id.data } });
  if (!acct) return { ok: false, error: "Not found." };
  await assertWorkspaceAccess(acct.workspaceId);
  const def = HOLDING_DEFS.find((h) => h.key === cls)!;

  const ops = [
    prisma.account.update({ where: { id: acct.id }, data: { name: d.name, holdingClass: cls, monthlyCashflowCents: monthly.cents, ...(acct.balanceMode === "MANUAL" ? { type: def.accountType } : {}) } }),
  ];
  if (value.cents !== null && acct.balanceMode === "MANUAL") {
    const when = isoToDate(d.asOf);
    const signed = def.side === "ASSET" ? value.cents : -value.cents;
    ops.push(prisma.manualBalanceEntry.deleteMany({ where: { accountId: acct.id, asOfDate: when } }) as never);
    ops.push(prisma.manualBalanceEntry.create({ data: { accountId: acct.id, asOfDate: when, balanceCents: signed } }) as never);
  }
  await prisma.$transaction(ops);
  revalidatePath("/holdings");
  revalidatePath("/accounts", "layout");
  revalidatePath("/reports");
  return { ok: true, message: "Saved." };
}

export async function archiveHoldingAction(accountId: string): Promise<ActionResult> {
  await assertAuthed();
  const a = await prisma.account.findUnique({ where: { id: accountId } });
  if (a) await assertWorkspaceAccess(a.workspaceId);
  if (!a || a.balanceMode !== "MANUAL") return { ok: false, error: "Only hand-valued assets and liabilities can be removed here." };
  await prisma.account.update({ where: { id: a.id }, data: { isArchived: true } });
  revalidatePath("/holdings");
  revalidatePath("/accounts");
  revalidatePath("/reports");
  return { ok: true };
}

/** Moves an asset or liability to the other workspace (Business <-> Personal). Its value history comes with it. */
export async function moveHoldingAction(accountId: string, toWorkspaceId: string): Promise<ActionResult> {
  await assertAuthed();
  const [acct, dest] = await Promise.all([
    prisma.account.findUnique({ where: { id: accountId }, include: { workspace: true } }),
    prisma.workspace.findUnique({ where: { id: toWorkspaceId } }),
  ]);
  if (acct) await assertWorkspaceAccess(acct.workspaceId);
  if (dest) await assertWorkspaceAccess(dest.id);
  if (!acct || acct.isArchived) return { ok: false, error: "Not found." };
  if (!dest) return { ok: false, error: "That workspace wasn't found." };
  if (acct.workspaceId === dest.id) return { ok: false, error: `It's already in ${dest.name}.` };
  // Transactions are tied to the pockets of the workspace they were recorded in, so an account with any can't change sides.
  const used = await prisma.transaction.count({ where: { OR: [{ accountId: acct.id }, { transferAccountId: acct.id }] } });
  if (used > 0) return { ok: false, error: `${acct.name} has transactions recorded against ${acct.workspace.name} pockets, so it can't be moved. Add it again in ${dest.name} instead.` };
  const clash = await prisma.account.findFirst({ where: { workspaceId: dest.id, isArchived: false, name: { equals: acct.name, mode: "insensitive" } } });
  if (clash) return { ok: false, error: `${dest.name} already has something called “${acct.name}”. Rename one first.` };
  await prisma.account.update({ where: { id: acct.id }, data: { workspaceId: dest.id } });
  revalidatePath("/holdings");
  revalidatePath("/accounts", "layout");
  revalidatePath("/budget");
  revalidatePath("/reports");
  return { ok: true, message: `Moved “${acct.name}” to ${dest.name}.` };
}
