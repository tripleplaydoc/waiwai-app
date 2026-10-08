"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertTransactionAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { assertAuthed, getCurrentUser } from "@/lib/auth";
import type { ActionResult } from "./types";

const schema = z.object({
  increasesRevenue: z.enum(["YES", "NO", "UNSURE"]).nullable(),
  strategicValue: z.array(z.enum(["CAPACITY", "RISK", "STRENGTH"])).max(3),
  stewardship: z.enum(["YES", "NO", "UNSURE"]).nullable(),
  notes: z.string().trim().max(500).optional(),
});

/** Saves the monthly review answers for one expense. */
export async function saveExpenseReviewAction(transactionId: string, input: z.input<typeof schema>): Promise<ActionResult> {
  await assertAuthed();
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: "Those answers weren't valid." };
  await assertTransactionAccess(transactionId);
  const tx = await prisma.transaction.findUnique({ where: { id: transactionId }, select: { id: true, workspaceId: true } });
  if (!tx) return { ok: false, error: "Transaction not found." };
  const me = await getCurrentUser();
  const data = { increasesRevenue: p.data.increasesRevenue, strategicValue: [...new Set(p.data.strategicValue)], stewardship: p.data.stewardship, notes: p.data.notes || null, reviewedById: me?.id ?? null };
  await prisma.expenseReview.upsert({
    where: { transactionId: tx.id },
    update: data,
    create: { ...data, transactionId: tx.id, workspaceId: tx.workspaceId },
  });
  revalidatePath("/reports");
  return { ok: true };
}
