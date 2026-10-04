"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { isoToDate } from "@/lib/utils/dates";
import type { ActionResult } from "./types";

const schema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(80),
  type: z.enum(["CHECKING", "SAVINGS", "CREDIT_CARD", "CASH", "INVESTMENT", "LOAN", "PROPERTY", "OTHER_ASSET", "OTHER_LIABILITY"]),
  opening: z.string().optional(),
  openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const OFF_BUDGET = new Set(["INVESTMENT", "LOAN", "PROPERTY", "OTHER_ASSET", "OTHER_LIABILITY"]);

export async function createAccountAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;

  let opening = 0;
  if (d.opening && d.opening.trim() !== "") {
    const c = parseToCents(d.opening);
    if (c === null) return { ok: false, error: "Opening balance must be an amount like 1250.00 (use a minus sign for a debt)." };
    opening = c;
  }
  const ws = await prisma.workspace.findUnique({ where: { id: d.workspaceId } });
  if (!ws) return { ok: false, error: "Workspace not found." };

  await prisma.account.create({
    data: {
      workspaceId: d.workspaceId,
      name: d.name,
      type: d.type,
      onBudget: !OFF_BUDGET.has(d.type),
      openingBalanceCents: opening,
      openingBalanceDate: d.openingDate ? isoToDate(d.openingDate) : null,
    },
  });
  revalidatePath("/accounts");
  revalidatePath("/budget");
  return { ok: true };
}
