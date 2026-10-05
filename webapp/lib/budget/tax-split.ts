import type { Prisma, PrismaClient } from "@prisma/client";
import type { TaxSplitPocket } from "./tax-split-math";

type Db = PrismaClient | Prisma.TransactionClient;

export interface TaxSplitInfo extends TaxSplitPocket { name: string; accountName: string }

/**
 * The per-account tax reserve pockets: app-managed (SYSTEM) pockets other than the main reserve that
 * are paid from one bank account. Nothing extra is stored; the pocket's "paid from" account is the link.
 */
export async function loadTaxSplits(db: Db, workspaceId: string, mainId: string | null): Promise<TaxSplitInfo[]> {
  const rows = await db.category.findMany({
    where: { workspaceId, type: "SYSTEM", isSystemManaged: true, isArchived: false, paidFromAccountId: { not: null }, ...(mainId ? { id: { not: mainId } } : {}) },
    select: { id: true, name: true, paidFromAccountId: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  if (rows.length === 0) return [];
  const accts = await db.account.findMany({ where: { id: { in: rows.map((r) => r.paidFromAccountId!) } }, select: { id: true, name: true } });
  const nameOf = new Map(accts.map((a) => [a.id, a.name]));
  return rows.map((r) => ({ id: r.id, name: r.name, accountId: r.paidFromAccountId!, accountName: nameOf.get(r.paidFromAccountId!) ?? "" }));
}
