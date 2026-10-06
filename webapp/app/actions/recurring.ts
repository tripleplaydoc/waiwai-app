"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed, getCurrentUser } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { isoToDate } from "@/lib/utils/dates";
import { isFrequency } from "@/lib/recurring-math";
import { postDue, skipDue } from "@/lib/recurring";
import type { ActionResult } from "./types";

const refresh = () => { revalidatePath("/recurring"); revalidatePath("/budget"); revalidatePath("/accounts", "layout"); revalidatePath("/reports"); };

const schema = z.object({
  id: z.string().optional(),
  accountId: z.string().min(1, "Pick an account."),
  payee: z.string().trim().min(1, "Enter who it is with.").max(200),
  amount: z.string(),
  direction: z.enum(["outflow", "inflow"]),
  frequency: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the next date."),
  endDate: z.string().optional(),
  categoryId: z.string().optional(),
  memo: z.string().trim().max(500).optional(),
  autoPost: z.string().optional(),
  deductible: z.string().optional(),
});

/** Creates or updates a repeating item. */
export async function saveRecurringAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  if (!isFrequency(d.frequency)) return { ok: false, error: "Pick how often it repeats." };
  const cents = parseToCents(d.amount);
  if (cents === null || cents <= 0) return { ok: false, error: "Enter an amount like 15.49." };
  const account = await prisma.account.findUnique({ where: { id: d.accountId } });
  if (!account || account.isArchived || account.balanceMode === "MANUAL") return { ok: false, error: "Pick an account that takes transactions." };
  let categoryId: string | null = null;
  if (d.categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: d.categoryId, workspaceId: account.workspaceId, isArchived: false }, select: { id: true } });
    if (!cat) return { ok: false, error: "Pocket not found." };
    categoryId = cat.id;
  }
  if (d.endDate && d.endDate < d.startDate) return { ok: false, error: "The end date is before the next date." };
  const data = {
    workspaceId: account.workspaceId, accountId: account.id, categoryId, payee: d.payee, memo: d.memo || null,
    amountCents: d.direction === "outflow" ? -cents : cents, frequency: d.frequency, nextDate: isoToDate(d.startDate), anchorDay: +d.startDate.slice(8, 10),
    endDate: d.endDate ? isoToDate(d.endDate) : null, autoPost: d.autoPost === "on", isDeductible: d.deductible === "on" && d.direction === "outflow" && !!categoryId, isActive: true,
  };
  try {
    if (d.id) {
      const have = await prisma.recurringItem.findUnique({ where: { id: d.id } });
      if (!have) return { ok: false, error: "That item was not found." };
      await prisma.recurringItem.update({ where: { id: d.id }, data: { ...data, workspaceId: have.workspaceId } });
    } else await prisma.recurringItem.create({ data });
  } catch { return { ok: false, error: "Recurring items aren't set up yet. Run the latest SQL first." }; }
  refresh();
  return { ok: true, message: d.id ? "Saved." : "Added." };
}

async function ws(id: string) {
  const it = await prisma.recurringItem.findUnique({ where: { id }, select: { workspaceId: true } });
  return it?.workspaceId ?? null;
}

/** Posts everything due for one item (after the person checked it). */
export async function postRecurringAction(id: string): Promise<ActionResult> {
  await assertAuthed();
  const w = await ws(id);
  if (!w) return { ok: false, error: "Not found." };
  const n = await postDue(w, { ids: [id], personId: (await getCurrentUser())?.id ?? null });
  refresh();
  return { ok: true, message: n === 1 ? "Posted." : `Posted ${n}.` };
}

/** Posts everything due in a workspace. */
export async function postAllRecurringAction(workspaceId: string): Promise<ActionResult> {
  await assertAuthed();
  const n = await postDue(workspaceId, { personId: (await getCurrentUser())?.id ?? null });
  refresh();
  return { ok: true, message: `Posted ${n}.` };
}

/** Skips what is due (it didn't happen) and moves on to the next date. */
export async function skipRecurringAction(id: string): Promise<ActionResult> {
  await assertAuthed();
  const w = await ws(id);
  if (!w) return { ok: false, error: "Not found." };
  await skipDue(w, id);
  refresh();
  return { ok: true };
}

export async function setRecurringActiveAction(id: string, active: boolean): Promise<ActionResult> {
  await assertAuthed();
  try { await prisma.recurringItem.update({ where: { id }, data: { isActive: active } }); } catch { return { ok: false, error: "Not found." }; }
  refresh();
  return { ok: true };
}

export async function deleteRecurringAction(id: string): Promise<ActionResult> {
  await assertAuthed();
  try { await prisma.recurringItem.delete({ where: { id } }); } catch { return { ok: false, error: "Not found." }; }
  refresh();
  return { ok: true };
}
