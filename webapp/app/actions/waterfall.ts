"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runWaterfallAutoAssign, type WaterfallRunResult } from "@/lib/budget/waterfall";

/**
 * Server action: triggers one priority-waterfall auto-assign pass for a
 * workspace/month. Called from a "Auto-Assign" button on the budget screen.
 *
 * Adjust the revalidatePath target to whatever route actually renders the
 * budget/envelope view in your app.
 */
export async function runWaterfallAutoAssignAction(
  workspaceId: string,
  monthIso: string
): Promise<WaterfallRunResult> {
  const month = new Date(monthIso);
  if (Number.isNaN(month.getTime())) {
    throw new Error(`Invalid month value: "${monthIso}"`);
  }

  const result = await runWaterfallAutoAssign(prisma, workspaceId, month);

  revalidatePath("/budget");

  return result;
}
