"use server";

import { replacePocketTags } from "@/lib/budget/tags-state";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { formatCents, parseToCents } from "@/lib/utils/currency";
import { getReadyToAssign } from "@/lib/budget/ready-to-assign";
import { addMonthsUTC, startOfMonthUTC } from "@/lib/budget/dates";
import { getCategoryAvailableBalance } from "@/lib/budget/category-balance";
import { endOfMonth, fundRows, loadPools, moveRows, releaseRows } from "@/lib/budget/funding";
import { bpsProblem, planAllocation, type AllocGroup } from "@/lib/budget/allocation";
import { customKey, isCustomKey, isTypeKey, typesFor } from "@/lib/budget/expense-types";
import type { ActionResult } from "./types";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const idSchema = z.string().min(1).max(64);

const pocketSchema = z.object({
  workspaceId: idSchema,
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(80),
  groupId: z.string().optional(),
  newGroupName: z.string().trim().max(80).optional(),
  type: z.enum(["EXPENSE", "INCOME"]).optional(),
  targetType: z.enum(["NONE", "MONTHLY_FUNDING", "TARGET_BALANCE", "TARGET_BALANCE_BY_DATE"]).default("NONE"),
  amount: z.string().optional(),
  targetDate: z.string().optional(),
  priorityRank: z.string().optional(),
  dueDay: z.string().optional(),
  isTaxDeductible: z.string().optional(),
  expenseType: z.string().optional(),
  customType: z.string().optional(),
  incomeKind: z.enum(["EARNED", "PORTFOLIO", "PASSIVE"]).optional(),
  paidFromId: z.string().optional(),
  monthsAhead: z.string().optional(),
});

/** Creates or edits a pocket (an envelope inside a category). */
export async function savePocketAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const parsed = pocketSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;

  const workspace = await prisma.workspace.findUnique({ where: { id: d.workspaceId } });
  if (!workspace) return { ok: false, error: "Workspace not found." };
  const existing = d.id ? await prisma.category.findFirst({ where: { id: d.id, workspaceId: d.workspaceId } }) : null;
  if (d.id && !existing) return { ok: false, error: "Pocket not found." };
  const isIncome = (existing?.type ?? d.type) === "INCOME";

  // Category (group)
  let groupId: string | null = existing?.categoryGroupId ?? null;
  if (d.groupId === "__new") {
    if (!d.newGroupName) return { ok: false, error: "Name the new category." };
    const top = await prisma.categoryGroup.aggregate({ where: { workspaceId: d.workspaceId }, _max: { sortOrder: true } });
    const g = await prisma.categoryGroup.create({ data: { workspaceId: d.workspaceId, name: d.newGroupName, sortOrder: (top._max.sortOrder ?? 0) + 1 } });
    groupId = g.id;
  } else if (d.groupId) {
    const g = await prisma.categoryGroup.findFirst({ where: { id: d.groupId, workspaceId: d.workspaceId } });
    if (!g) return { ok: false, error: "Category not found." };
    groupId = g.id;
  }

  // Cost / goal
  let targetType: "MONTHLY_FUNDING" | "TARGET_BALANCE" | "TARGET_BALANCE_BY_DATE" | null = null;
  let targetCents: number | null = null;
  let targetDate: Date | null = null;
  if (!isIncome && d.targetType !== "NONE") {
    targetCents = parseToCents(d.amount ?? "");
    if (targetCents === null || targetCents <= 0) return { ok: false, error: "Enter an amount greater than zero, like 500.00" };
    targetType = d.targetType;
    if (targetType === "TARGET_BALANCE_BY_DATE") {
      if (!d.targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(d.targetDate)) return { ok: false, error: "Pick the date you want to reach this goal by." };
      targetDate = new Date(`${d.targetDate}T00:00:00.000Z`);
      if (Number.isNaN(targetDate.getTime())) return { ok: false, error: "That date isn't valid." };
    }
  }
  let rank: number | null = null;
  if (!isIncome && d.priorityRank && d.priorityRank.trim() !== "") {
    rank = Number(d.priorityRank);
    if (!Number.isInteger(rank) || rank < 1 || rank > 999) return { ok: false, error: "Priority must be a whole number from 1 to 999." };
  }

  let dueDay: number | null = null;
  if (!isIncome && d.dueDay && d.dueDay.trim() !== "") {
    dueDay = Number(d.dueDay);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return { ok: false, error: "Due day must be a number from 1 to 31." };
  }

  let expenseType: string | null = null;
  if (d.expenseType === "__new") {
    const name = (d.customType ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 40) return { ok: false, error: "Name your custom type (2–40 characters)." };
    if (/[<>"]/.test(name)) return { ok: false, error: "Custom type names can't include < > or quotes." };
    // Reuse an existing custom type with the same name (any capitalization) so the P&L groups them together.
    const known = await prisma.category.findMany({ where: { workspaceId: d.workspaceId, expenseType: { startsWith: "CUSTOM:" } }, select: { expenseType: true }, distinct: ["expenseType"] });
    const match = known.find((k) => k.expenseType!.slice(7).toLowerCase() === name.toLowerCase());
    const builtIn = [...typesFor("EXPENSE"), ...typesFor("INCOME")].find((t) => t.label.toLowerCase() === name.toLowerCase());
    expenseType = builtIn ? builtIn.key : match?.expenseType ?? customKey(name);
  } else if (d.expenseType && d.expenseType.trim() !== "") {
    if (!isTypeKey(d.expenseType)) return { ok: false, error: "Pick a type from the list." };
    if (!isCustomKey(d.expenseType) && !typesFor(isIncome ? "INCOME" : "EXPENSE").some((t) => t.key === d.expenseType)) {
      return { ok: false, error: isIncome ? "Pick an income type." : "Pick an expense type." };
    }
    expenseType = d.expenseType;
  }

  const monthsAhead = targetType === "MONTHLY_FUNDING" ? Math.min(12, Math.max(0, Math.floor(Number(d.monthsAhead ?? 0)) || 0)) : 0;
  let paidFromAccountId: string | null | undefined; // undefined = leave as is
  if (d.paidFromId !== undefined) {
    if (d.paidFromId === "" || isIncome) paidFromAccountId = null;
    else {
      const a = await prisma.account.findFirst({ where: { id: d.paidFromId, workspaceId: d.workspaceId, onBudget: true, isArchived: false, balanceMode: "TRANSACTION_DERIVED", type: { not: "CREDIT_CARD" } } });
      if (!a) return { ok: false, error: "Pick one of your bank accounts." };
      paidFromAccountId = a.id;
    }
  }
  const incomeKind = isIncome ? d.incomeKind ?? "EARNED" : null;
  const deductible = workspace.type === "BUSINESS" && !isIncome && d.isTaxDeductible === "on";
  let newId: string | undefined;
  try {
    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: {
          // System envelopes keep their name and category.
          ...(existing.isSystemManaged ? {} : { name: d.name, categoryGroupId: groupId }),
          isTaxDeductible: existing.isSystemManaged ? existing.isTaxDeductible : deductible,
          priorityRank: isIncome ? null : rank,
          dueDay,
          ...(isIncome ? { incomeKind } : {}),
          expenseType: existing.isSystemManaged ? existing.expenseType : expenseType,
          fundingTargetType: targetType,
          fundingTargetCents: targetCents,
          fundingTargetByDate: targetDate,
          monthsAhead,
          ...(paidFromAccountId !== undefined ? { paidFromAccountId } : {}),
        },
      });
    } else {
      const top = await prisma.category.aggregate({ where: { workspaceId: d.workspaceId, categoryGroupId: groupId }, _max: { sortOrder: true } });
      const made = await prisma.category.create({
        data: {
          workspaceId: d.workspaceId,
          categoryGroupId: groupId,
          name: d.name,
          type: d.type ?? "EXPENSE",
          sortOrder: (top._max.sortOrder ?? -1) + 1,
          isTaxDeductible: deductible,
          priorityRank: isIncome ? null : rank,
          dueDay,
          expenseType,
          incomeKind,
          fundingTargetType: targetType,
          fundingTargetCents: targetCents,
          fundingTargetByDate: targetDate,
          monthsAhead,
          paidFromAccountId: paidFromAccountId ?? null,
        },
      });
      newId = made.id;
    }
  } catch {
    return { ok: false, error: "Couldn't save that pocket." };
  }
  // Tags ride along with the form; a problem here never blocks saving the pocket.
  if (formData.get("tagsSent") === "1") {
    try { await replacePocketTags(d.workspaceId, existing?.id ?? newId ?? "", String(formData.get("tagIds") ?? "").split(",").filter(Boolean)); } catch { /* tags table not there yet */ }
  }
  revalidatePath("/budget");
  revalidatePath("/reports");
  return { ok: true };
}

/** Creates or renames a category (the bigger bucket that holds pockets). */
export async function saveGroupAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const parsed = z.object({ workspaceId: idSchema, id: z.string().optional(), name: z.string().trim().min(1, "Name is required").max(80) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { workspaceId, id, name } = parsed.data;
  if (id) {
    const g = await prisma.categoryGroup.findFirst({ where: { id, workspaceId } });
    if (!g) return { ok: false, error: "Category not found." };
    await prisma.categoryGroup.update({ where: { id }, data: { name } });
  } else {
    const top = await prisma.categoryGroup.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
    await prisma.categoryGroup.create({ data: { workspaceId, name, sortOrder: (top._max.sortOrder ?? 0) + 1 } });
  }
  revalidatePath("/budget");
  revalidatePath("/reports");
  return { ok: true };
}

/**
 * Takes pockets out of the budget. Money still sitting in a pocket goes back to Ready to assign
 * (otherwise it would stay "assigned" to a pocket nobody can see). History keeps its reference.
 * Returns the cents released. The app-managed Business tax reserve can't be removed; on Personal it can.
 */
async function removePockets(workspaceId: string, workspaceType: "PERSONAL" | "BUSINESS", ids: string[]): Promise<{ ok: true; releasedCents: number } | { ok: false; error: string }> {
  if (ids.length === 0) return { ok: true, releasedCents: 0 };
  const pockets = await prisma.category.findMany({ where: { id: { in: ids }, workspaceId, isArchived: false } });
  const locked = pockets.find((c) => c.isSystemManaged && workspaceType === "BUSINESS");
  if (locked) return { ok: false, error: `“${locked.name}” is managed by the app and can't be deleted.` };

  const month = startOfMonthUTC(new Date());
  const balances = await Promise.all(pockets.map((c) => getCategoryAvailableBalance(prisma, c.id, month)));
  const release = pockets.map((c, i) => ({ c, cents: balances[i] })).filter((x) => x.cents > 0);
  const live = pockets.map((c) => c.id);
  const releaseRowsAll = (await Promise.all(release.map((x) => releaseRows(prisma, { workspaceId, categoryId: x.c.id, month, cents: x.cents, source: "CORRECTION", note: "Released back to the pool (pocket deleted)" })))).flat();
  await prisma.$transaction([
    prisma.budgetAssignment.createMany({ data: releaseRowsAll }),
    prisma.category.updateMany({ where: { id: { in: live } }, data: { isArchived: true } }),
  ]);
  return { ok: true, releasedCents: release.reduce((s, x) => s + x.cents, 0) };
}

/** Anything that pointed at deleted categories/pockets stops pointing there; the flows switch off instead of breaking. */
async function unlinkFlows(workspaceId: string, groupIds: string[], pocketIds: string[]) {
  const [wf, pf] = await Promise.all([
    prisma.waterfallConfig.findUnique({ where: { workspaceId } }),
    prisma.personalFlowConfig.findUnique({ where: { workspaceId } }),
  ]);
  const gone = (id: string | null) => !!id && (groupIds.includes(id) || pocketIds.includes(id));
  if (wf && [wf.opexGroupId, wf.cashGroupId, wf.taxCategoryId, wf.reservoir1CategoryId, wf.reservoir2CategoryId].some(gone)) {
    await prisma.waterfallConfig.update({
      where: { workspaceId },
      data: {
        enabled: false,
        opexGroupId: gone(wf.opexGroupId) ? null : wf.opexGroupId, cashGroupId: gone(wf.cashGroupId) ? null : wf.cashGroupId,
        taxCategoryId: gone(wf.taxCategoryId) ? null : wf.taxCategoryId,
        reservoir1CategoryId: gone(wf.reservoir1CategoryId) ? null : wf.reservoir1CategoryId,
        reservoir2CategoryId: gone(wf.reservoir2CategoryId) ? null : wf.reservoir2CategoryId,
      },
    });
  }
  if (pf && [...pf.giveGroupIds, ...pf.saveGroupIds, ...pf.liveGroupIds].some((id) => groupIds.includes(id))) {
    const keep = (ids: string[]) => ids.filter((id) => !groupIds.includes(id));
    await prisma.personalFlowConfig.update({ where: { workspaceId }, data: { giveGroupIds: keep(pf.giveGroupIds), saveGroupIds: keep(pf.saveGroupIds), liveGroupIds: keep(pf.liveGroupIds) } });
  }
}

/** Deletes a category together with every pocket in it. Money in those pockets returns to Ready to assign. */
export async function archiveGroupAction(workspaceId: string, id: string): Promise<ActionResult> {
  await assertAuthed();
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const g = ws && (await prisma.categoryGroup.findFirst({ where: { id, workspaceId, isArchived: false } }));
  if (!ws || !g) return { ok: false, error: "Category not found." };
  const pockets = await prisma.category.findMany({ where: { categoryGroupId: id, isArchived: false }, select: { id: true } });
  const r = await removePockets(workspaceId, ws.type, pockets.map((p) => p.id));
  if (!r.ok) return r;
  await prisma.categoryGroup.update({ where: { id }, data: { isArchived: true } });
  await unlinkFlows(workspaceId, [id], pockets.map((p) => p.id));
  revalidatePath("/budget");
  revalidatePath("/reports");
  const n = pockets.length;
  return { ok: true, message: `Deleted “${g.name}”${n ? ` and its ${n} pocket${n === 1 ? "" : "s"}` : ""}.${r.releasedCents > 0 ? ` ${formatCents(r.releasedCents)} is back in the pool.` : ""}` };
}

/** Deletes a pocket (history keeps its reference). Money in it returns to Ready to assign. */
export async function archivePocketAction(workspaceId: string, id: string): Promise<ActionResult> {
  await assertAuthed();
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const c = ws && (await prisma.category.findFirst({ where: { id, workspaceId, isArchived: false } }));
  if (!ws || !c) return { ok: false, error: "Pocket not found." };
  const r = await removePockets(workspaceId, ws.type, [id]);
  if (!r.ok) return r;
  await unlinkFlows(workspaceId, [], [id]);
  revalidatePath("/budget");
  revalidatePath("/reports");
  return { ok: true, message: `Deleted “${c.name}”.${r.releasedCents > 0 ? ` ${formatCents(r.releasedCents)} is back in the pool.` : ""}` };
}

const reorderSchema = z.object({
  groups: z.array(idSchema).max(200),
  pockets: z.record(z.string(), z.array(idSchema).max(500)),
});

/** Saves drag-and-drop order: category order, pocket order, and which category each pocket sits in. */
export async function reorderAction(workspaceId: string, payload: string): Promise<ActionResult> {
  await assertAuthed();
  let json: unknown;
  try { json = JSON.parse(payload); } catch { return { ok: false, error: "Bad request." }; }
  const parsed = reorderSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: "Bad request." };
  const { groups, pockets } = parsed.data;

  const [dbGroups, dbPockets] = await Promise.all([
    prisma.categoryGroup.findMany({ where: { workspaceId }, select: { id: true } }),
    prisma.category.findMany({ where: { workspaceId }, select: { id: true } }),
  ]);
  const gOk = new Set(dbGroups.map((g) => g.id));
  const pOk = new Set(dbPockets.map((p) => p.id));
  if (groups.some((id) => !gOk.has(id))) return { ok: false, error: "Unknown category." };
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  groups.forEach((id, i) => ops.push(prisma.categoryGroup.update({ where: { id }, data: { sortOrder: i + 1 } })));
  for (const [gid, ids] of Object.entries(pockets)) {
    if (gid !== "__none" && !gOk.has(gid)) return { ok: false, error: "Unknown category." };
    if (ids.some((id) => !pOk.has(id))) return { ok: false, error: "Unknown pocket." };
    ids.forEach((id, i) => ops.push(prisma.category.update({ where: { id }, data: { sortOrder: i, categoryGroupId: gid === "__none" ? null : gid } })));
  }
  await prisma.$transaction(ops);
  revalidatePath("/budget");
  revalidatePath("/reports");
  return { ok: true };
}

const bpsSchema = z.number().int().min(0).max(10000).nullable();
const allocSchema = z.object({
  groups: z.array(z.object({ id: idSchema, bps: bpsSchema })).max(200),
  pockets: z.array(z.object({ id: idSchema, bps: bpsSchema })).max(1000),
});

/** Saves the percentage split (null = not part of the split). */
export async function saveAllocationAction(workspaceId: string, payload: string): Promise<ActionResult> {
  await assertAuthed();
  let json: unknown;
  try { json = JSON.parse(payload); } catch { return { ok: false, error: "Bad request." }; }
  const parsed = allocSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: "Percentages must be between 0 and 100." };

  const [dbGroups, dbPockets] = await Promise.all([
    prisma.categoryGroup.findMany({ where: { workspaceId, isArchived: false }, select: { id: true } }),
    prisma.category.findMany({ where: { workspaceId, isArchived: false, type: "EXPENSE", isSystemManaged: false }, select: { id: true, categoryGroupId: true } }),
  ]);
  const gIds = new Set(dbGroups.map((g) => g.id));
  const pGroup = new Map(dbPockets.map((p) => [p.id, p.categoryGroupId]));
  const { groups, pockets } = parsed.data;
  if (groups.some((g) => !gIds.has(g.id)) || pockets.some((p) => !pGroup.has(p.id))) return { ok: false, error: "Unknown category or pocket." };

  const alloc: AllocGroup[] = groups.map((g) => ({
    id: g.id, bps: g.bps,
    pockets: pockets.filter((p) => pGroup.get(p.id) === g.id).map((p) => ({ id: p.id, bps: p.bps })),
  }));
  const problem = bpsProblem(alloc);
  if (problem) return { ok: false, error: problem };

  await prisma.$transaction([
    ...groups.map((g) => prisma.categoryGroup.update({ where: { id: g.id }, data: { allocationBps: g.bps } })),
    ...pockets.map((p) => prisma.category.update({ where: { id: p.id }, data: { allocationBps: p.bps } })),
  ]);
  revalidatePath("/budget");
  revalidatePath("/reports");
  return { ok: true };
}

async function loadAllocGroups(workspaceId: string): Promise<{ groups: AllocGroup[]; names: Map<string, string> }> {
  const [groups, pockets] = await Promise.all([
    prisma.categoryGroup.findMany({ where: { workspaceId, isArchived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.category.findMany({ where: { workspaceId, isArchived: false, type: "EXPENSE", isSystemManaged: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const names = new Map(pockets.map((p) => [p.id, p.name]));
  return {
    names,
    groups: groups.map((g) => ({
      id: g.id, bps: g.allocationBps,
      pockets: pockets.filter((p) => p.categoryGroupId === g.id).map((p) => ({ id: p.id, bps: p.allocationBps })),
    })),
  };
}

export type AllocationPreview =
  | { ok: true; poolCents: number; allocatedCents: number; unallocatedCents: number; lines: { id: string; name: string; cents: number }[] }
  | { ok: false; error: string };

/** Shows what "assign by percentages" would do, without writing anything. */
export async function previewAllocationAction(workspaceId: string, month: string, amount: string): Promise<AllocationPreview> {
  await assertAuthed();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "Bad request." };
  const monthDate = new Date(`${m.data}-01T00:00:00.000Z`);
  const rta = Math.max(0, await getReadyToAssign(prisma, workspaceId, new Date(addMonthsUTC(monthDate, 1).getTime() - 1)));
  let pool = rta;
  if (amount.trim() !== "") {
    const c = parseToCents(amount);
    if (c === null || c <= 0) return { ok: false, error: "Enter an amount like 2500.00, or leave it blank to use all the money in the pool." };
    if (c > rta) return { ok: false, error: "That's more than your money in pool." };
    pool = c;
  }
  const { groups, names } = await loadAllocGroups(workspaceId);
  const plan = planAllocation(pool, groups);
  return {
    ok: true, poolCents: pool, allocatedCents: plan.allocatedCents, unallocatedCents: plan.unallocatedCents,
    lines: plan.pockets.map((p) => ({ id: p.id, name: names.get(p.id) ?? "Pocket", cents: p.cents })),
  };
}

/** Adds the percentage split to this month's assignments. */
export async function applyAllocationAction(workspaceId: string, month: string, amount: string): Promise<ActionResult> {
  await assertAuthed();
  const preview = await previewAllocationAction(workspaceId, month, amount);
  if (!preview.ok) return preview;
  if (preview.lines.length === 0) return { ok: false, error: "Nothing to assign yet. Set percentages first." };
  const monthDate = new Date(`${month}-01T00:00:00.000Z`);
  const rows = await fundRows(prisma, workspaceId, endOfMonth(monthDate), preview.lines.map((l) => ({ categoryId: l.id, month: monthDate, amountCents: l.cents, source: "AUTO_PERCENT" as const })));
  await prisma.budgetAssignment.createMany({ data: rows });
  revalidatePath("/budget");
  revalidatePath("/reports");
  return { ok: true, message: `Assigned across ${preview.lines.length} pocket${preview.lines.length === 1 ? "" : "s"}.` };
}

const nameSchema = z.string().trim().min(1, "Name can't be empty").max(80);

/** Click-to-rename for a pocket. */
export async function renamePocketAction(workspaceId: string, id: string, name: string): Promise<ActionResult> {
  await assertAuthed();
  const n = nameSchema.safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0]?.message ?? "Bad name." };
  const c = await prisma.category.findFirst({ where: { id, workspaceId } });
  if (!c) return { ok: false, error: "Pocket not found." };
  if (c.isSystemManaged) return { ok: false, error: "This pocket is managed by the app and can't be renamed." };
  await prisma.category.update({ where: { id }, data: { name: n.data } });
  revalidatePath("/budget");
  revalidatePath("/reports");
  return { ok: true };
}

/** Click-to-rename for a category. */
export async function renameGroupAction(workspaceId: string, id: string, name: string): Promise<ActionResult> {
  await assertAuthed();
  const n = nameSchema.safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0]?.message ?? "Bad name." };
  const g = await prisma.categoryGroup.findFirst({ where: { id, workspaceId } });
  if (!g) return { ok: false, error: "Category not found." };
  await prisma.categoryGroup.update({ where: { id }, data: { name: n.data } });
  revalidatePath("/budget");
  revalidatePath("/reports");
  return { ok: true };
}

/** Marks (or un-marks) a pocket's bill as paid for one month. */
export async function setPaidAction(workspaceId: string, categoryId: string, month: string, paid: boolean): Promise<ActionResult> {
  await assertAuthed();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "Bad request." };
  const c = await prisma.category.findFirst({ where: { id: categoryId, workspaceId, isArchived: false } });
  if (!c) return { ok: false, error: "Pocket not found." };
  const monthDate = new Date(`${m.data}-01T00:00:00.000Z`);
  if (paid) {
    await prisma.billPayment.upsert({
      where: { categoryId_month: { categoryId, month: monthDate } },
      update: {},
      create: { categoryId, month: monthDate },
    });
  } else {
    await prisma.billPayment.deleteMany({ where: { categoryId, month: monthDate } });
  }
  revalidatePath("/budget");
  revalidatePath("/reports");
  return { ok: true };
}

/** Adds money to a pocket from Ready to Assign (on top of what's already there). */
export async function assignMoreAction(workspaceId: string, categoryId: string, month: string, amount: string, fromAccountId?: string): Promise<ActionResult> {
  await assertAuthed();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "Bad request." };
  const cents = parseToCents(amount);
  if (cents === null || cents <= 0) return { ok: false, error: "Enter an amount like 250.00" };
  const c = await prisma.category.findFirst({ where: { id: categoryId, workspaceId, isArchived: false } });
  if (!c || c.type === "INCOME") return { ok: false, error: "Pick a spending pocket." };
  const monthDate = new Date(`${m.data}-01T00:00:00.000Z`);
  const asOf = endOfMonth(monthDate);
  const rta = await getReadyToAssign(prisma, workspaceId, asOf);
  const money = (n: number) => (Math.max(0, n) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  if (cents > rta) return { ok: false, error: `Only ${money(rta)} is in the pool.` };
  let prefer: string | undefined;
  if (fromAccountId) {
    const acct = await prisma.account.findFirst({ where: { id: fromAccountId, workspaceId, onBudget: true, isArchived: false } });
    if (!acct) return { ok: false, error: "Pick one of your accounts." };
    const pool = (await loadPools(prisma, workspaceId, asOf)).get(acct.id) ?? 0;
    if (cents > pool) return { ok: false, error: `${acct.name} only has ${money(pool)} in the pool.` };
    prefer = acct.id;
  }
  const rows = await fundRows(prisma, workspaceId, asOf, [{ categoryId, month: monthDate, amountCents: cents, source: "MANUAL" }], prefer);
  await prisma.budgetAssignment.createMany({ data: rows });
  revalidatePath("/budget");
  revalidatePath("/reports");
  return { ok: true };
}

/**
 * Moves already-assigned money from one pocket to another. The ledger is
 * append-only, so this writes two offsetting rows in one transaction (minus
 * from the source, plus to the destination); Ready to Assign is unchanged.
 */
export async function moveMoneyAction(workspaceId: string, fromId: string, toId: string, month: string, amount: string): Promise<ActionResult> {
  await assertAuthed();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "Bad request." };
  if (!fromId || !toId) return { ok: false, error: "Pick both pockets." };
  if (fromId === toId) return { ok: false, error: "Pick two different pockets." };
  const cents = parseToCents(amount);
  if (cents === null || cents <= 0) return { ok: false, error: "Enter an amount like 50.00" };

  const [from, to] = await Promise.all([
    prisma.category.findFirst({ where: { id: fromId, workspaceId, isArchived: false } }),
    prisma.category.findFirst({ where: { id: toId, workspaceId, isArchived: false } }),
  ]);
  if (!from || !to) return { ok: false, error: "Pocket not found." };
  if (from.type === "INCOME" || to.type === "INCOME") return { ok: false, error: "Income sources don't hold money. Pick spending pockets." };
  if (from.isSystemManaged || to.isSystemManaged) return { ok: false, error: "The tax reserve is managed automatically. Use the tax rebalance instead." };

  const monthDate = new Date(`${m.data}-01T00:00:00.000Z`);
  const available = await getCategoryAvailableBalance(prisma, from.id, monthDate);
  if (cents > available) {
    return { ok: false, error: `${from.name} only has ${(Math.max(0, available) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} available.` };
  }
  const rows = await moveRows(prisma, { workspaceId, fromId: from.id, toId: to.id, month: monthDate, cents, source: "MANUAL", noteFrom: `Moved to ${to.name}`, noteTo: `Moved from ${from.name}` });
  await prisma.budgetAssignment.createMany({ data: rows });
  revalidatePath("/budget");
  revalidatePath("/reports");
  return { ok: true, message: `Moved to ${to.name}.` };
}

/** Takes money out of a pocket and puts it back in Ready to assign (the account tags go back with it). */
export async function releaseToReadyAction(workspaceId: string, fromId: string, month: string, amount: string): Promise<ActionResult> {
  await assertAuthed();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "Bad request." };
  const cents = parseToCents(amount);
  if (cents === null || cents <= 0) return { ok: false, error: "Enter an amount like 50.00" };
  const from = await prisma.category.findFirst({ where: { id: fromId, workspaceId, isArchived: false } });
  if (!from) return { ok: false, error: "Pocket not found." };
  if (from.type === "INCOME") return { ok: false, error: "Income sources don't hold money. Pick a spending pocket." };
  if (from.isSystemManaged) return { ok: false, error: "The tax reserve is managed automatically. Use the tax rebalance instead." };
  const monthDate = new Date(`${m.data}-01T00:00:00.000Z`);
  const available = await getCategoryAvailableBalance(prisma, from.id, monthDate);
  if (cents > available) {
    return { ok: false, error: `${from.name} only has ${(Math.max(0, available) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} available.` };
  }
  const rows = await releaseRows(prisma, { workspaceId, categoryId: from.id, month: monthDate, cents, source: "MANUAL", note: "Moved back to the pool" });
  await prisma.budgetAssignment.createMany({ data: rows });
  revalidatePath("/budget");
  revalidatePath("/reports");
  return { ok: true, message: "Moved back to the pool." };
}

/** One-tap fix from the "Deductions to check" panel: count this business pocket's spending as tax-deductible. */
export async function markPocketDeductibleAction(workspaceId: string, id: string): Promise<ActionResult> {
  await assertAuthed();
  const c = await prisma.category.findFirst({ where: { id, workspaceId, isArchived: false, type: "EXPENSE", isSystemManaged: false }, include: { workspace: { select: { type: true } } } });
  if (!c || c.workspace.type !== "BUSINESS") return { ok: false, error: "Pocket not found." };
  await prisma.category.update({ where: { id: c.id }, data: { isTaxDeductible: true } });
  revalidatePath("/reports");
  revalidatePath("/budget");
  return { ok: true };
}
