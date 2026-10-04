"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { getCategoryAssignedForMonth } from "@/lib/budget/category-balance";
import { runWaterfallAutoAssign } from "@/lib/budget/waterfall";
import type { ActionResult } from "./types";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

/**
 * Sets a category's TOTAL assigned amount for a month. The ledger is
 * append-only (see schema header), so this never edits history: it computes
 * the difference from what is already assigned and appends one MANUAL row.
 */
export async function setAssignedAction(formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const categoryId = z.string().min(1).safeParse(formData.get("categoryId"));
  const month = monthSchema.safeParse(formData.get("month"));
  const cents = parseToCents(String(formData.get("amount") ?? ""));
  if (!categoryId.success || !month.success) return { ok: false, error: "Bad request." };
  if (cents === null) return { ok: false, error: "Enter an amount like 250.00" };
  if (cents < 0) return { ok: false, error: "Assigned amount can't be negative." };

  const category = await prisma.category.findUnique({ where: { id: categoryId.data } });
  if (!category || category.isArchived) return { ok: false, error: "Category not found." };
  if (category.type === "INCOME") return { ok: false, error: "Income categories don't get assignments." };

  const monthDate = new Date(`${month.data}-01T00:00:00.000Z`);
  const current = await getCategoryAssignedForMonth(prisma, category.id, monthDate);
  const delta = cents - current;
  if (delta !== 0) {
    await prisma.budgetAssignment.create({
      data: { categoryId: category.id, month: monthDate, amountCents: delta, source: "MANUAL" },
    });
  }
  revalidatePath("/budget");
  return { ok: true };
}

export async function autoAssignAction(formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const workspaceId = z.string().min(1).safeParse(formData.get("workspaceId"));
  const month = monthSchema.safeParse(formData.get("month"));
  if (!workspaceId.success || !month.success) return { ok: false, error: "Bad request." };
  try {
    const result = await runWaterfallAutoAssign(prisma, workspaceId.data, new Date(`${month.data}-01T00:00:00.000Z`));
    revalidatePath("/budget");
    const funded = result.buckets.filter((b) => b.fundedCents > 0).length;
    return { ok: true, message: `Funded ${funded} envelope${funded === 1 ? "" : "s"}.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Auto-assign failed." };
  }
}

const categorySchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(80),
  groupId: z.string().optional(),
  newGroupName: z.string().trim().max(80).optional(),
  type: z.enum(["EXPENSE", "INCOME"]),
  target: z.string().optional(),
  priorityRank: z.string().optional(),
  isTaxDeductible: z.string().optional(),
});

export async function createCategoryAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;

  const workspace = await prisma.workspace.findUnique({ where: { id: d.workspaceId } });
  if (!workspace) return { ok: false, error: "Workspace not found." };

  let groupId: string | null = d.groupId && d.groupId !== "__new" ? d.groupId : null;
  if (d.groupId === "__new") {
    if (!d.newGroupName) return { ok: false, error: "Name the new group." };
    const g = await prisma.categoryGroup.create({ data: { workspaceId: d.workspaceId, name: d.newGroupName } });
    groupId = g.id;
  } else if (groupId) {
    const g = await prisma.categoryGroup.findFirst({ where: { id: groupId, workspaceId: d.workspaceId } });
    if (!g) return { ok: false, error: "Group not found." };
  }

  let targetCents: number | null = null;
  if (d.target && d.target.trim() !== "") {
    targetCents = parseToCents(d.target);
    if (targetCents === null || targetCents <= 0) return { ok: false, error: "Monthly target must be an amount like 500.00" };
  }
  let rank: number | null = null;
  if (d.priorityRank && d.priorityRank.trim() !== "") {
    rank = Number(d.priorityRank);
    if (!Number.isInteger(rank) || rank < 1 || rank > 999) return { ok: false, error: "Priority must be a whole number from 1 to 999." };
  }

  try {
    await prisma.category.create({
      data: {
        workspaceId: d.workspaceId,
        categoryGroupId: groupId,
        name: d.name,
        type: d.type,
        isTaxDeductible: workspace.type === "BUSINESS" && d.type === "EXPENSE" && d.isTaxDeductible === "on",
        priorityRank: d.type === "EXPENSE" ? rank : null,
        fundingTargetType: d.type === "EXPENSE" && targetCents ? "MONTHLY_FUNDING" : null,
        fundingTargetCents: d.type === "EXPENSE" ? targetCents : null,
      },
    });
  } catch {
    return { ok: false, error: "Couldn't save that category." };
  }
  revalidatePath("/budget");
  return { ok: true };
}

/** Archives (never deletes) a category so historical transactions keep their reference. */
export async function archiveCategoryAction(formData: FormData): Promise<void> {
  await assertAuthed();
  const id = z.string().min(1).parse(formData.get("categoryId"));
  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat || cat.isSystemManaged) return;
  await prisma.category.update({ where: { id }, data: { isArchived: true } });
  revalidatePath("/budget");
}

