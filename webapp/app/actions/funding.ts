"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { loadPocketTags } from "@/lib/budget/funding";
import type { ActionResult } from "./types";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

/**
 * Money that was assigned before accounts were tracked has no account tag. This tags all of it to one account,
 * with offsetting ledger rows (the ledger is append-only), pocket by pocket.
 */
export async function tagUntaggedAction(workspaceId: string, month: string, accountId: string): Promise<ActionResult> {
  await assertAuthed();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "Bad request." };
  const acct = await prisma.account.findFirst({ where: { id: accountId, workspaceId, onBudget: true, isArchived: false } });
  if (!acct || acct.type === "CREDIT_CARD") return { ok: false, error: "Pick a bank account." };
  const monthDate = new Date(`${m.data}-01T00:00:00.000Z`);
  const pockets = await prisma.category.findMany({ where: { workspaceId, isArchived: false, type: { not: "INCOME" } }, select: { id: true } });
  const tags = await loadPocketTags(prisma, pockets.map((p) => p.id), monthDate);
  const rows = [...tags].flatMap(([categoryId, parts]) => {
    const n = parts.find(([k]) => k === null)?.[1] ?? 0;
    if (n <= 0) return [];
    const base = { categoryId, month: monthDate, source: "CORRECTION" as const, note: `Tagged to ${acct.name}` };
    return [{ ...base, amountCents: -n, fundingAccountId: null }, { ...base, amountCents: n, fundingAccountId: acct.id }];
  });
  if (rows.length === 0) return { ok: false, error: "Nothing to tag." };
  await prisma.budgetAssignment.createMany({ data: rows });
  revalidatePath("/budget");
  return { ok: true, message: `Tagged to ${acct.name}.` };
}
