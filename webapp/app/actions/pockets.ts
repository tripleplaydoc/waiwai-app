"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { getReadyToAssign } from "@/lib/budget/ready-to-assign";
import { addMonthsUTC } from "@/lib/budget/dates";
import { bpsProblem, planAllocation, type AllocGroup } from "@/lib/budget/allocation";
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

  const deductible = workspace.type === "BUSINESS" && !isIncome && d.isTaxDeductible === "on";
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
          fundingTargetType: targetType,
          fundingTargetCents: targetCents,
          fundingTargetByDate: targetDate,
        },
      });
    } else {
      const top = await prisma.category.aggregate({ where: { workspaceId: d.workspaceId, categoryGroupId: groupId }, _max: { sortOrder: true } });
      await prisma.category.create({
        data: {
          workspaceId: d.workspaceId,
          categoryGroupId: groupId,
          name: d.name,
          type: d.type ?? "EXPENSE",
          sortOrder: (top._max.sortOrder ?? -1) + 1,
          isTaxDeductible: deductible,
          priorityRank: isIncome ? null : rank,
          dueDay,
          fundingTargetType: targetType,
          fundingTargetCents: targetCents,
          fundingTargetByDate: targetDate,
        },
      });
    }
  } catch {
    return { ok: false, error: "Couldn't save that pocket." };
  }
  revalidatePath("/budget");
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
  return { ok: true };
}

/** Archives a category. It must be empty so no pocket is left homeless. */
export async function archiveGroupAction(workspaceId: string, id: string): Promise<ActionResult> {
  await assertAuthed();
  const g = await prisma.categoryGroup.findFirst({ where: { id, workspaceId } });
  if (!g) return { ok: false, error: "Category not found." };
  const live = await prisma.category.count({ where: { categoryGroupId: id, isArchived: false } });
  if (live > 0) return { ok: false, error: "Move or delete its pockets first." };
  await prisma.categoryGroup.update({ where: { id }, data: { isArchived: true } });
  revalidatePath("/budget");
  return { ok: true };
}

/** Archives a pocket (history keeps its reference). */
export async function archivePocketAction(workspaceId: string, id: string): Promise<ActionResult> {
  await assertAuthed();
  const c = await prisma.category.findFirst({ where: { id, workspaceId } });
  if (!c) return { ok: false, error: "Pocket not found." };
  if (c.isSystemManaged) return { ok: false, error: "This pocket is managed by the app and can't be deleted." };
  await prisma.category.update({ where: { id }, data: { isArchived: true } });
  revalidatePath("/budget");
  return { ok: true };
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
    if (c === null || c <= 0) return { ok: false, error: "Enter an amount like 2500.00, or leave it blank to use Ready to Assign." };
    if (c > rta) return { ok: false, error: "That's more than your Ready to Assign amount." };
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
  await prisma.budgetAssignment.createMany({
    data: preview.lines.map((l) => ({ categoryId: l.id, month: monthDate, amountCents: l.cents, source: "AUTO_PERCENT" as const })),
  });
  revalidatePath("/budget");
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
  return { ok: true };
}

/** Adds money to a pocket from Ready to Assign (on top of what's already there). */
export async function assignMoreAction(workspaceId: string, categoryId: string, month: string, amount: string): Promise<ActionResult> {
  await assertAuthed();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "Bad request." };
  const cents = parseToCents(amount);
  if (cents === null || cents <= 0) return { ok: false, error: "Enter an amount like 250.00" };
  const c = await prisma.category.findFirst({ where: { id: categoryId, workspaceId, isArchived: false } });
  if (!c || c.type === "INCOME") return { ok: false, error: "Pick a spending pocket." };
  const monthDate = new Date(`${m.data}-01T00:00:00.000Z`);
  const rta = await getReadyToAssign(prisma, workspaceId, new Date(addMonthsUTC(monthDate, 1).getTime() - 1));
  if (cents > rta) return { ok: false, error: `Only ${(Math.max(0, rta) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} is ready to assign.` };
  await prisma.budgetAssignment.create({ data: { categoryId, month: monthDate, amountCents: cents, source: "MANUAL" } });
  revalidatePath("/budget");
  return { ok: true };
}
