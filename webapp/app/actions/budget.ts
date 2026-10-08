"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { getCategoryAssignedForMonth } from "@/lib/budget/category-balance";
import { runWaterfallAutoAssign } from "@/lib/budget/waterfall";
import { endOfMonth, fundRows, releaseRows } from "@/lib/budget/funding";
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
  if (category) await assertWorkspaceAccess(category.workspaceId);
  if (!category || category.isArchived) return { ok: false, error: "Category not found." };
  if (category.type === "INCOME") return { ok: false, error: "Income categories don't get assignments." };

  const monthDate = new Date(`${month.data}-01T00:00:00.000Z`);
  const current = await getCategoryAssignedForMonth(prisma, category.id, monthDate);
  const delta = cents - current;
  if (delta > 0) {
    const rows = await fundRows(prisma, category.workspaceId, endOfMonth(monthDate), [{ categoryId: category.id, month: monthDate, amountCents: delta, source: "MANUAL" }]);
    await prisma.budgetAssignment.createMany({ data: rows });
  } else if (delta < 0) {
    const rows = await releaseRows(prisma, { workspaceId: category.workspaceId, categoryId: category.id, month: monthDate, cents: -delta, source: "MANUAL" });
    await prisma.budgetAssignment.createMany({ data: rows });
  }
  revalidatePath("/budget");
  return { ok: true };
}

export async function autoAssignAction(formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const workspaceId = z.string().min(1).safeParse(formData.get("workspaceId"));
  const month = monthSchema.safeParse(formData.get("month"));
  if (!workspaceId.success || !month.success) return { ok: false, error: "Bad request." };
  await assertWorkspaceAccess(workspaceId.data);
  try {
    const result = await runWaterfallAutoAssign(prisma, workspaceId.data, new Date(`${month.data}-01T00:00:00.000Z`));
    revalidatePath("/budget");
    const funded = result.buckets.filter((b) => b.fundedCents > 0).length;
    return { ok: true, message: `Funded ${funded} pocket${funded === 1 ? "" : "s"}.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Auto-assign failed." };
  }
}

/** Archives (never deletes) a category so historical transactions keep their reference. */
export async function archiveCategoryAction(formData: FormData): Promise<void> {
  await assertAuthed();
  const id = z.string().min(1).parse(formData.get("categoryId"));
  const cat = await prisma.category.findUnique({ where: { id } });
  if (cat) await assertWorkspaceAccess(cat.workspaceId);
  if (!cat || cat.isSystemManaged) return;
  await prisma.category.update({ where: { id }, data: { isArchived: true, assetAccountId: null, assetGoalCents: null } });
  revalidatePath("/budget");
}

