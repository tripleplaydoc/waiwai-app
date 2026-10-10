import { Prisma, type PrismaClient } from "@prisma/client";
import { buildMoves, type MoveEntry, type MoveRow, type MoveTransfer } from "./moves-math";

type Db = PrismaClient | Prisma.TransactionClient;

/** Notes the app writes on moves of money (see moves-math classify). Anything else in the ledger is ordinary budgeting. */
const MOVE_NOTES = ["Moved to ", "Moved from ", "Moved back to the pool", "Directed with transfer", "Moved with transfer", "Rebalanced:", "Held in set:", "Held in fix", "Balance fix", "Fix", "Undo"];

const toRow = (r: { id: string; categoryId: string; category: { name: string }; fundingAccountId: string | null; month: Date; amountCents: number; source: string; note: string | null; createdAt: Date }): MoveRow => ({
  id: r.id, categoryId: r.categoryId, categoryName: r.category.name, fundingAccountId: r.fundingAccountId, month: r.month.toISOString().slice(0, 10),
  amountCents: r.amountCents, source: r.source, note: r.note, createdAtMs: r.createdAt.getTime(),
});

/** Transfers between the workspace's own bank accounts (the receiving half carries the amount). Credit card payments are left out. */
async function loadTransfers(db: Db, workspaceId: string, take: number): Promise<MoveTransfer[]> {
  const halves = await db.transaction.findMany({
    where: { workspaceId, transferGroupId: { not: null }, amountCents: { gt: 0 }, transferAccountId: { not: null }, account: { type: { not: "CREDIT_CARD" } }, transferAccount: { type: { not: "CREDIT_CARD" } } },
    orderBy: { createdAt: "desc" }, take,
    select: { transferGroupId: true, amountCents: true, date: true, createdAt: true, account: { select: { id: true, name: true } }, transferAccount: { select: { id: true, name: true } } },
  });
  return halves.filter((h) => h.transferGroupId && h.transferAccount).map((h) => ({
    groupId: h.transferGroupId!, fromId: h.transferAccount!.id, toId: h.account.id, fromName: h.transferAccount!.name, toName: h.account.name,
    cents: h.amountCents, date: h.date.toISOString().slice(0, 10), createdAtMs: h.createdAt.getTime(),
  }));
}

/** Every move of money in this workspace, newest first, with whether it can still be undone. */
export async function loadMoveLog(db: Db, workspaceId: string, limit = 100): Promise<MoveEntry[]> {
  const [rows, transfers, accounts] = await Promise.all([
    db.budgetAssignment.findMany({
      where: { category: { workspaceId }, source: { in: ["MANUAL", "CORRECTION"] }, OR: MOVE_NOTES.map((p) => ({ note: { startsWith: p } })) },
      orderBy: { createdAt: "desc" }, take: 3000,
      select: { id: true, categoryId: true, category: { select: { name: true } }, fundingAccountId: true, month: true, amountCents: true, source: true, note: true, createdAt: true },
    }),
    loadTransfers(db, workspaceId, 400),
    db.account.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
  ]);
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  return buildMoves(rows.map(toRow), transfers, names).slice(0, limit);
}

/** The ledger rows of one move (everything saved at that moment), whatever their notes. */
export async function loadMoveRows(db: Db, workspaceId: string, ms: number): Promise<MoveRow[]> {
  const rows = await db.budgetAssignment.findMany({
    where: { category: { workspaceId }, createdAt: new Date(ms) },
    select: { id: true, categoryId: true, category: { select: { name: true } }, fundingAccountId: true, month: true, amountCents: true, source: true, note: true, createdAt: true },
  });
  return rows.map(toRow);
}
