"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { runWaterfallAutoAssign, type WaterfallRunResult } from "@/lib/budget/waterfall";

/**
 * Server action: triggers one priority-waterfall auto-assign pass for a
 * workspace/month. Called from the "Auto-assign" button on the budget screen.
 */
export async function runWaterfallAutoAssignAction(
  workspaceId: string,
  monthIso: string
): Promise<WaterfallRunResult> {
  await assertAuthed();
  const month = new Date(monthIso);
  if (Number.isNaN(month.getTime())) {
    throw new Error(`Invalid month value: "${monthIso}"`);
  }

  const result = await runWaterfallAutoAssign(prisma, workspaceId, month);

  revalidatePath("/budget");

  return result;
}
