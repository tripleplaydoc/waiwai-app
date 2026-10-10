"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAccountAccess, assertCategoryAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { assertAuthed, getCurrentUser } from "@/lib/auth";
import { formatCents, parseToCents } from "@/lib/utils/currency";
import { isoToDate, todayIso } from "@/lib/utils/dates";
import { startOfMonthUTC } from "@/lib/budget/dates";
import { endOfMonth, loadAllPocketBalances, loadPocketBalances, loadPocketTags, loadPools, retagRows } from "@/lib/budget/funding";
import { splitProRata } from "@/lib/budget/funding-math";
import { planRebalance } from "@/lib/budget/rebalance-math";
import { capDirected, planHeldEdit, type HeldRow, type Want } from "@/lib/budget/directed-math";
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
 * receiving account, so the tags always match where the cash really is. The person may choose which pockets
 * that money belongs to (fields `pocket_<id>` = amount); only the "Held in" labels move, never a pocket total.
 */
export async function transferAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  await Promise.all([assertAccountAccess(get("fromId")), assertAccountAccess(get("toId"))]);
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

  // Pockets the person chose (optional): their money is labelled as moving with this transfer.
  const wants: Want[] = [];
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("pocket_")) continue;
    const raw = String(v).trim();
    if (!raw) continue;
    const n = parseToCents(raw);
    if (n === null || n < 0) return { ok: false, error: "Check the pocket amounts: use numbers like 25.00." };
    if (n > 0) wants.push([k.slice(7), n]);
  }
  await Promise.all(wants.map(([pid]) => assertCategoryAccess(pid)));
  const wantedTotal = wants.reduce((t, [, n]) => t + n, 0);

  // How much of this has to come out of pocket money (the sending account's free cash covers the rest).
  const pool = (await loadPools(prisma, workspaceId, endOfMonth(month))).get(from!.id) ?? 0;
  const needFromPockets = Math.max(0, cents - Math.max(0, pool));
  let directed = 0;
  let movedWith = 0;
  const retag = [] as ReturnType<typeof retagRows>;
  if (wants.length > 0 || needFromPockets > 0) {
    const balances = await loadAllPocketBalances(prisma, workspaceId, month);
    const heldIn = new Map<string, number>();
    for (const [pid, parts] of balances) { const n = parts.find(([k]) => k === from!.id)?.[1] ?? 0; if (n > 0) heldIn.set(pid, n); }
    // First the pockets the person chose, up to what each holds here and up to the amount moved.
    for (const [pid, n] of capDirected(wants, heldIn, cents)) {
      retag.push(...retagRows({ categoryId: pid, month, cents: n, from: from!.id, to: to!.id, note: `Directed with transfer to ${to!.name}` }));
      heldIn.set(pid, (heldIn.get(pid) ?? 0) - n);
      directed += n;
    }
    // Whatever the sending account is still short is spread across the pockets that hold money there.
    const stillNeeded = Math.max(0, needFromPockets - directed);
    if (stillNeeded > 0) {
      const holding: [string, number][] = [...heldIn].filter(([, n]) => n > 0);
      const total = holding.reduce((s, [, n]) => s + n, 0);
      for (const [pid, n] of splitProRata(holding, Math.min(stillNeeded, total))) {
        retag.push(...retagRows({ categoryId: pid as string, month, cents: n, from: from!.id, to: to!.id, note: `Moved with transfer to ${to!.name}` }));
        movedWith += n;
      }
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
  const short = Math.max(0, needFromPockets - directed - movedWith);
  const parts = [`Moved ${formatCents(cents)} from ${from!.name} to ${to!.name}.`];
  if (directed > 0) parts.push(`${formatCents(directed)} went to the pockets you chose.`);
  if (wantedTotal > directed) parts.push(`${formatCents(wantedTotal - directed)} of your pocket amounts could not be used (a pocket can only send what it holds in ${from!.name}, and no more than the amount moved).`);
  if (movedWith > 0) parts.push(`${formatCents(movedWith)} of other pocket money moved with it.`);
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

/**
 * Sets where each pocket's cash is held between two accounts, A and B. Fields: `aId`, `bId`, and `held_<pocketId>` =
 * how much of that pocket should be held in B (the rest of what it holds in the two accounts stays in A).
 * Only "Held in" labels change; pocket amounts, Ready to assign and bank balances stay exactly the same.
 */
export async function setHeldInAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  await Promise.all([assertAccountAccess(get("aId")), assertAccountAccess(get("bId"))]);
  const [a, b] = await Promise.all([
    prisma.account.findUnique({ where: { id: get("aId") } }),
    prisma.account.findUnique({ where: { id: get("bId") } }),
  ]);
  const bad = (x: typeof a) => !x || x.isArchived || !x.onBudget || x.balanceMode !== "TRANSACTION_DERIVED" || x.type === "CREDIT_CARD";
  if (bad(a) || bad(b)) return { ok: false, error: "Pick two of your bank accounts." };
  if (a!.id === b!.id) return { ok: false, error: "Pick two different accounts." };
  if (a!.workspaceId !== b!.workspaceId) return { ok: false, error: "Both accounts must be in the same workspace." };
  const workspaceId = a!.workspaceId;

  const targets = new Map<string, number>();
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("held_")) continue;
    const raw = String(v).trim();
    const n = raw === "" ? 0 : parseToCents(raw);
    if (n === null || n < 0) return { ok: false, error: "Check the amounts: use numbers like 25.00." };
    targets.set(k.slice(5), n);
  }
  if (targets.size === 0) return { ok: false, error: "Nothing to change." };
  await Promise.all([...targets.keys()].map((pid) => assertCategoryAccess(pid)));

  const month = startOfMonthUTC(isoToDate(todayIso()));
  const [pools, balances] = await Promise.all([loadPools(prisma, workspaceId, endOfMonth(month)), loadAllPocketBalances(prisma, workspaceId, month)]);
  const rows: HeldRow[] = [];
  for (const [pid, targetB] of targets) {
    const parts = balances.get(pid);
    if (!parts) continue;
    rows.push({ pocketId: pid, a: parts.find(([k]) => k === a!.id)?.[1] ?? 0, b: parts.find(([k]) => k === b!.id)?.[1] ?? 0, targetB });
  }
  const moves = planHeldEdit(rows);
  if (moves.length === 0) return { ok: true, message: "Nothing needed to change." };

  // The account that ends up holding more pocket money must have the free cash for it.
  const gainB = moves.reduce((t, m) => t + (m.from === "a" ? m.cents : -m.cents), 0);
  if (gainB > 0 && Math.max(0, pools.get(b!.id) ?? 0) < gainB) return { ok: false, error: `${b!.name} doesn't have enough free cash to hold ${formatCents(gainB)} more. Move some other pockets back to ${a!.name} first.` };
  if (gainB < 0 && Math.max(0, pools.get(a!.id) ?? 0) < -gainB) return { ok: false, error: `${a!.name} doesn't have enough free cash to hold ${formatCents(-gainB)} more. Move some other pockets to ${b!.name} first.` };

  const data = moves.flatMap((m) => retagRows({ categoryId: m.pocketId, month, cents: m.cents, from: m.from === "a" ? a!.id : b!.id, to: m.from === "a" ? b!.id : a!.id, note: `Held in set: ${m.from === "a" ? a!.name : b!.name} to ${m.from === "a" ? b!.name : a!.name}` }));
  await prisma.budgetAssignment.createMany({ data });
  refresh();
  const moved = moves.reduce((t, m) => t + m.cents, 0);
  return { ok: true, message: `Updated where ${new Set(moves.map((m) => m.pocketId)).size} pocket${new Set(moves.map((m) => m.pocketId)).size === 1 ? "" : "s"} hold${new Set(moves.map((m) => m.pocketId)).size === 1 ? "s" : ""} cash (${formatCents(moved)} of labels moved). No pocket amounts changed.` };
}
