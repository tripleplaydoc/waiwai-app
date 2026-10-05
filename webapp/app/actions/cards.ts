"use server";

import { endOfMonth, fundRows, moveRows } from "@/lib/budget/funding";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertAuthed, getCurrentUser } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { isoToDate, todayIso } from "@/lib/utils/dates";
import { startOfMonthUTC } from "@/lib/budget/dates";
import { getReadyToAssign } from "@/lib/budget/ready-to-assign";
import { getBudgetSummary } from "@/lib/budget/summary";
import { loadCardStatuses } from "@/lib/budget/cards";
import type { ActionResult } from "./types";

const refresh = (cardId: string) => {
  revalidatePath(`/accounts/${cardId}`);
  revalidatePath("/accounts", "layout");
  revalidatePath("/budget");
  revalidatePath("/holdings");
  revalidatePath("/reports");
};
const blank = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

async function getCard(id: unknown) {
  const c = typeof id === "string" ? await prisma.account.findUnique({ where: { id } }) : null;
  return c && c.type === "CREDIT_CARD" && !c.isArchived ? c : null;
}

/** Pays a card from another account: two linked rows (money out of the paying account, debt down on the card). Not spending, so no pocket is touched. */
export async function payCardAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const card = await getCard(formData.get("cardId"));
  if (!card) return { ok: false, error: "Card not found." };
  const from = await prisma.account.findUnique({ where: { id: String(formData.get("fromAccountId") ?? "") } });
  if (!from || from.isArchived || from.workspaceId !== card.workspaceId || from.id === card.id) return { ok: false, error: "Pick the account you're paying from." };
  const t = blank(formData.get("amount"));
  const cents = t ? parseToCents(t) : null;
  if (cents === null || cents <= 0) return { ok: false, error: "Enter the payment amount, like 250.00." };
  const dateText = blank(formData.get("date")) ?? todayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return { ok: false, error: "Pick a date." };
  const date = isoToDate(dateText);
  const me = (await getCurrentUser())?.id ?? null;
  const group = randomUUID();
  const base = { workspaceId: card.workspaceId, date, clearedStatus: "UNCLEARED" as const, needsReview: false, personId: me, transferGroupId: group, categoryId: null, memo: "Card payment" };
  await prisma.$transaction([
    prisma.transaction.create({ data: { ...base, accountId: from.id, transferAccountId: card.id, amountCents: -cents } }),
    prisma.transaction.create({ data: { ...base, accountId: card.id, transferAccountId: from.id, amountCents: cents } }),
  ]);
  refresh(card.id); revalidatePath(`/accounts/${from.id}`);
  return { ok: true, message: "Payment recorded." };
}

/** Covers a card's shortfall: moves money into the short pockets from Ready to Assign or from another pocket. */
export async function coverCardShortfallAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const card = await getCard(formData.get("cardId"));
  if (!card) return { ok: false, error: "Card not found." };
  const month = startOfMonthUTC(isoToDate(todayIso()));
  const status = (await loadCardStatuses(card.workspaceId, month)).find((c) => c.id === card.id);
  if (!status || status.parts.length === 0) return { ok: false, error: status && status.uncategorizedCents > 0 ? "The rest of the shortfall is spending with no pocket. Give those transactions a pocket first." : "Nothing to cover." };
  const total = status.parts.reduce((s, p) => s + p.cents, 0);
  const source = String(formData.get("source") ?? "RTA");
  const rows: { categoryId: string; amountCents: number }[] = status.parts.map((p) => ({ categoryId: p.categoryId, amountCents: p.cents }));
  if (source === "RTA") {
    const rta = await getReadyToAssign(prisma, card.workspaceId, new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)));
    if (rta < total) return { ok: false, error: `Money in pool only has ${(Math.max(0, rta) / 100).toFixed(2)} and ${(total / 100).toFixed(2)} is needed. Pick a pocket to take it from instead.` };
  } else {
    const summary = await getBudgetSummary(card.workspaceId, month);
    const src = summary.rows.find((r) => r.id === source && r.type !== "INCOME");
    if (!src || status.parts.some((p) => p.categoryId === src.id)) return { ok: false, error: "Pick a different pocket to take it from." };
    if (src.availableCents < total) return { ok: false, error: `${src.name} only has ${(Math.max(0, src.availableCents) / 100).toFixed(2)} available.` };
  }
  const note = `Cover ${card.name}`;
  let tagged;
  if (source === "RTA") {
    tagged = await fundRows(prisma, card.workspaceId, endOfMonth(month), rows.map((r) => ({ ...r, month, source: "MANUAL" as const, note })));
  } else {
    tagged = (await Promise.all(rows.map((r) => moveRows(prisma, { workspaceId: card.workspaceId, fromId: source, toId: r.categoryId, month, cents: r.amountCents, source: "MANUAL", noteFrom: note, noteTo: note })))).flat();
  }
  await prisma.budgetAssignment.createMany({ data: tagged });
  refresh(card.id);
  return { ok: true, message: "Covered. Your card is fully set aside." };
}

/** Interest rate and minimum payment for a card (feeds the debt payoff plan). */
export async function saveCardTermsAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const card = await getCard(formData.get("cardId"));
  if (!card) return { ok: false, error: "Card not found." };
  const rateText = blank(formData.get("rate"))?.replace(/%/g, "").trim() ?? null;
  if (rateText !== null && (!/^\d{1,3}(\.\d{1,2})?$/.test(rateText) || Number(rateText) > 100)) return { ok: false, error: "Interest rate should look like 24.99 (a yearly percentage)." };
  const payText = blank(formData.get("payment"));
  const pay = payText ? parseToCents(payText) : null;
  if (payText && (pay === null || pay < 0)) return { ok: false, error: "Minimum payment must be an amount like 35.00." };
  const bps = rateText === null ? null : Math.round(Number(rateText) * 100);
  const dayOf = (k: string, label: string): { day: number | null } | { error: string } => {
    const t = blank(formData.get(k));
    if (t === null) return { day: null };
    const n = Number(t);
    return Number.isInteger(n) && n >= 1 && n <= 31 ? { day: n } : { error: `${label} should be a day of the month, 1 to 31.` };
  };
  const stmt = dayOf("statementDay", "Statement date"), due = dayOf("dueDay", "Due date");
  if ("error" in stmt) return { ok: false, error: stmt.error };
  if ("error" in due) return { ok: false, error: due.error };
  const fields = { interestRateBps: bps, statementDay: stmt.day, dueDay: due.day };
  await prisma.$transaction([
    prisma.holdingDetail.upsert({ where: { accountId: card.id }, create: { accountId: card.id, ...fields }, update: fields }),
    prisma.account.update({ where: { id: card.id }, data: { monthlyCashflowCents: pay } }),
  ]);
  if (bps && bps > 0) await ensureInterestPocket(card.workspaceId);
  refresh(card.id);
  return { ok: true, message: "Card details saved." };
}

/** An "Interest & fees" pocket to charge card interest to, so what debt costs you is visible. */
export async function ensureInterestPocket(workspaceId: string) {
  const existing = await prisma.category.findFirst({ where: { workspaceId, isArchived: false, name: { equals: "Interest & fees", mode: "insensitive" } } });
  if (existing) return existing;
  let group = await prisma.categoryGroup.findFirst({ where: { workspaceId, isArchived: false, name: { in: ["Debt", "Debts"], mode: "insensitive" } } });
  if (!group) {
    const last = await prisma.categoryGroup.findFirst({ where: { workspaceId }, orderBy: { sortOrder: "desc" } });
    group = await prisma.categoryGroup.create({ data: { workspaceId, name: "Debt", sortOrder: (last?.sortOrder ?? 0) + 1 } });
  }
  return prisma.category.create({ data: { workspaceId, categoryGroupId: group.id, name: "Interest & fees", type: "EXPENSE" } });
}
