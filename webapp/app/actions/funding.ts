"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed, getCurrentUser } from "@/lib/auth";
import { formatCents, parseToCents } from "@/lib/utils/currency";
import { isoToDate, todayIso } from "@/lib/utils/dates";
import { startOfMonthUTC } from "@/lib/budget/dates";
import { endOfMonth, loadAllPocketBalances, loadPocketBalances, loadPocketTags, loadPools, retagRows } from "@/lib/budget/funding";
import { splitProRata } from "@/lib/budget/funding-math";
import { planRebalance } from "@/lib/budget/rebalance-math";
import { assertWorkspaceAccess } from "@/lib/workspace";
import type { ActionResult } from "./types";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const refresh = () => {
  revalidatePath("/budget");
  revalidatePath("/accounts", "layout");
  revalidatePath("/holdings");
  revalidatePath("/reports");
};

/**
 * Moves cash between two of your own bank accounts (two linked rows, not spending, so no pocket is touched).
 * If the sending account has less free cash than you move, pocket money tagged to it moves along to the
 * receiving account, so the tags always match where the cash really is.
 */
export async function transferAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const [from, to] = await Promise.all([
    prisma.account.findUnique({ where: { id: get("fromId") } }),
    prisma.account.findUnique({ where: { id: get("toId") } }),
  ]);
  const bad = (a: typeof from) => !a || a.isArchived || !a.onBudget || a.balanceMode !== "TRANSACTION_DERIVED";
  if (bad(from) || bad(to)) return { ok: false, error: "Pick two of your bank accounts." };
  if (from!.id === to!.id) return { ok: false, error: "Pick two different accounts." };
  if (from!.workspaceId !== to!.workspaceId) return { ok: false, error: "Both accounts must be in the same workspace." };
  if (from!.type === "CREDIT_CARD" || to!.type === "CREDIT_CARD") return { ok: false, error: "To pay a credit card, open the card and tap Pay card." };
  const cents = parseToCents(get("amount"));
  if (cents === null || cents <= 0) return { ok: false, error: "Enter the amount, like 500.00." };
  const dateText = get("date") || todayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return { ok: false, error: "Pick a date." };
  const workspaceId = from!.workspaceId;
  const month = startOfMonthUTC(isoToDate(todayIso()));

  // How much of this has to come out of pocket money (the sending account's free cash covers the rest).
  const pool = (await loadPools(prisma, workspaceId, endOfMonth(month))).get(from!.id) ?? 0;
  const needFromPockets = Math.max(0, cents - Math.max(0, pool));
  let movedWith = 0;
  const retag = [] as ReturnType<typeof retagRows>;
  if (needFromPockets > 0) {
    const balances = await loadAllPocketBalances(prisma, workspaceId, month);
    const holding: [string, number][] = [];
    for (const [pid, parts] of balances) { const n = parts.find(([k]) => k === from!.id)?.[1] ?? 0; if (n > 0) holding.push([pid, n]); }
    const total = holding.reduce((s, [, n]) => s + n, 0);
    for (const [pid, n] of splitProRata(holding, Math.min(needFromPockets, total))) {
      retag.push(...retagRows({ categoryId: pid as string, month, cents: n, from: from!.id, to: to!.id, note: `Moved with transfer to ${to!.name}` }));
      movedWith += n;
    }
  }

  const me = (await getCurrentUser())?.id ?? null;
  const group = randomUUID();
  const base = { workspaceId, date: isoToDate(dateText), clearedStatus: "UNCLEARED" as const, needsReview: false, personId: me, transferGroupId: group, categoryId: null, memo: "Transfer between accounts" };
  await prisma.$transaction([
    prisma.transaction.create({ data: { ...base, accountId: from!.id, transferAccountId: to!.id, amountCents: -cents } }),
    prisma.transaction.create({ data: { ...base, accountId: to!.id, transferAccountId: from!.id, amountCents: cents } }),
    ...(retag.length ? [prisma.budgetAssignment.createMany({ data: retag })] : []),
  ]);
  refresh();
  const short = needFromPockets - movedWith;
  const parts = [`Moved ${formatCents(cents)} from ${from!.name} to ${to!.name}.`];
  if (movedWith > 0) parts.push(`${formatCents(movedWith)} of pocket money moved with it.`);
  if (short > 0) parts.push(`${from!.name} now holds ${formatCents(short)} less than your budget expects.`);
  return { ok: true, message: parts.join(" ") };
}

/**
 * Fixes accounts whose pockets claim more cash than the account holds, by moving the "held in" label of pocket money
 * to accounts with free cash. Pocket amounts and Ready to assign do not change.
 */
export async function rebalanceHeldInAction(workspaceId: string): Promise<ActionResult> {
  await assertAuthed();
  await assertWorkspaceAccess(workspaceId);
  const month = startOfMonthUTC(isoToDate(todayIso()));
  const [pools, balances, accounts] = await Promise.all([
    loadPools(prisma, workspaceId, endOfMonth(month)),
    loadAllPocketBalances(prisma, workspaceId, month),
    prisma.account.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
  ]);
  const moves = planRebalance(pools, balances);
  if (moves.length === 0) return { ok: true, message: "Nothing to rebalance." };
  const name = new Map(accounts.map((a) => [a.id, a.name]));
  const rows = moves.flatMap((m) => retagRows({ categoryId: m.pocketId, month, cents: m.cents, from: m.from, to: m.to, note: `Rebalanced: ${m.from ? name.get(m.from) ?? "account" : "untagged"} to ${name.get(m.to) ?? "account"}` }));
  await prisma.budgetAssignment.createMany({ data: rows });
  refresh();
  const total = moves.reduce((t, m) => t + m.cents, 0);
  return { ok: true, message: `Moved ${formatCents(total)} of labels so each account matches the cash it holds. No pocket amounts changed.` };
}
