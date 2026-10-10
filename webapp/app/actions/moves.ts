"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { isoToDate, todayIso } from "@/lib/utils/dates";
import { startOfMonthUTC } from "@/lib/budget/dates";
import { endOfMonth, loadAllPocketBalances, loadPools } from "@/lib/budget/funding";
import { loadMoveLog, loadMoveRows } from "@/lib/budget/moves";
import { inverseRows, undoProblem } from "@/lib/budget/moves-math";
import type { ActionResult } from "./types";

const keySchema = z.string().regex(/^(\d{1,16}|t:[\w-]{1,64})$/);

/**
 * Undoes one move of money, any move in the Money moves log (not just the newest). Nothing is erased: the pocket
 * labels get offsetting rows, and a transfer between your own accounts is removed (both halves). The move stays in
 * the log, marked undone. It is refused, in plain words, when the money is no longer where it was.
 */
export async function undoMoveAction(workspaceId: string, key: string): Promise<ActionResult> {
  await assertAuthed();
  await assertWorkspaceAccess(workspaceId);
  const k = keySchema.safeParse(key);
  if (!k.success) return { ok: false, error: "Move not found." };

  const log = await loadMoveLog(prisma, workspaceId, 2000);
  const entry = log.find((e) => e.key === k.data);
  if (!entry) return { ok: false, error: "That move is no longer in the log." };
  if (entry.undone) return { ok: false, error: "That move was already undone." };
  if (!entry.canUndo) return { ok: false, error: "That one can't be undone." };

  const rows = k.data.startsWith("t:") ? [] : await loadMoveRows(prisma, workspaceId, Number(k.data));
  const inverse = inverseRows(rows, k.data);

  // A transfer is removed too: its two halves must be this workspace's.
  const halves = entry.transferGroupId ? await prisma.transaction.findMany({ where: { workspaceId, transferGroupId: entry.transferGroupId }, select: { id: true, accountId: true, amountCents: true } }) : [];
  if (entry.transferGroupId && halves.length !== 2) return { ok: false, error: "That transfer has already been changed or removed." };
  if (inverse.length === 0 && halves.length === 0) return { ok: false, error: "Nothing to undo." };

  const month = startOfMonthUTC(isoToDate(todayIso()));
  const [pools, balances, accounts, cats] = await Promise.all([
    loadPools(prisma, workspaceId, endOfMonth(month)),
    loadAllPocketBalances(prisma, workspaceId, month),
    prisma.account.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
  ]);
  const held = new Map<string, Map<string, number>>();
  for (const [pid, parts] of balances) held.set(pid, new Map(parts.filter(([, n]) => n > 0).map(([a, n]) => [a ?? "none", n])));
  const txPoolDelta = new Map<string | null, number>();
  for (const h of halves) txPoolDelta.set(h.accountId, (txPoolDelta.get(h.accountId) ?? 0) - h.amountCents);

  const problem = undoProblem({
    inverse, names: new Map(accounts.map((a) => [a.id, a.name])), pocketNames: new Map(cats.map((c) => [c.id, c.name])),
    held, pools, txPoolDelta,
  });
  if (problem) return { ok: false, error: problem };

  await prisma.$transaction([
    ...(inverse.length ? [prisma.budgetAssignment.createMany({ data: inverse.map((r) => ({ categoryId: r.categoryId, month: isoToDate(r.month), amountCents: r.amountCents, source: "CORRECTION" as const, note: r.note, fundingAccountId: r.fundingAccountId })) })] : []),
    ...(halves.length ? [prisma.transaction.deleteMany({ where: { id: { in: halves.map((h) => h.id) } } })] : []),
  ]);
  revalidatePath("/budget");
  revalidatePath("/accounts", "layout");
  revalidatePath("/holdings");
  revalidatePath("/reports");
  return { ok: true, message: `Undone: ${entry.title}.` };
}
