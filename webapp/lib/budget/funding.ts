import { Prisma, type AssignmentSource, type PrismaClient } from "@prisma/client";
import { addMonthsUTC } from "@/lib/budget/dates";
import { drawFromPools, pocketBalances, pocketShares, splitProRata, type Key, type Parts } from "./funding-math";

type Db = PrismaClient | Prisma.TransactionClient;

type NewRow = Prisma.BudgetAssignmentCreateManyInput;

/** Last moment of the month that starts at `monthStart`. */
export const endOfMonth = (monthStart: Date) => new Date(addMonthsUTC(monthStart, 1).getTime() - 1);

/**
 * Ready to assign, split by the bank account the money is in. Same inputs as getReadyToAssign:
 * starting balances + income, plus money moved between your own accounts, minus what is assigned
 * (by the account it was tagged to). The pools add up to Ready to assign. The null key holds money
 * that was assigned before accounts were tracked (it only ever subtracts).
 */
export async function loadPools(db: Db, workspaceId: string, asOfDate: Date): Promise<Map<Key, number>> {
  const periodEnd = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate() + 1));
  const [accounts, income, transfers, assigned] = await Promise.all([
    db.account.findMany({
      where: { workspaceId, onBudget: true, balanceMode: "TRANSACTION_DERIVED", OR: [{ openingBalanceDate: null }, { openingBalanceDate: { lt: periodEnd } }] },
      select: { id: true, openingBalanceCents: true },
    }),
    db.transaction.groupBy({ by: ["accountId"], where: { workspaceId, date: { lt: periodEnd }, account: { onBudget: true }, category: { type: "INCOME" } }, _sum: { amountCents: true } }),
    db.transaction.groupBy({ by: ["accountId"], where: { workspaceId, date: { lt: periodEnd }, account: { onBudget: true }, transferGroupId: { not: null } }, _sum: { amountCents: true } }),
    db.budgetAssignment.groupBy({ by: ["fundingAccountId"], where: { category: { workspaceId }, month: { lt: periodEnd } }, _sum: { amountCents: true } }),
  ]);
  const pools = new Map<Key, number>();
  const add = (k: Key, n: number) => pools.set(k, (pools.get(k) ?? 0) + n);
  for (const a of accounts) add(a.id, a.openingBalanceCents);
  for (const r of income) add(r.accountId, r._sum.amountCents ?? 0);
  for (const r of transfers) add(r.accountId, r._sum.amountCents ?? 0);
  for (const r of assigned) add(r.fundingAccountId, -(r._sum.amountCents ?? 0));
  return pools;
}

/** What each pocket has been assigned, by tag, up to and including `month`. */
export async function loadPocketTags(db: Db, categoryIds: string[], month: Date): Promise<Map<string, Parts>> {
  const out = new Map<string, Parts>();
  if (categoryIds.length === 0) return out;
  const rows = await db.budgetAssignment.groupBy({ by: ["categoryId", "fundingAccountId"], where: { categoryId: { in: categoryIds }, month: { lte: month } }, _sum: { amountCents: true } });
  for (const r of rows) {
    const list = out.get(r.categoryId) ?? [];
    list.push([r.fundingAccountId, r._sum.amountCents ?? 0]);
    out.set(r.categoryId, list);
  }
  return out;
}

/**
 * What each pocket holds in each account, after its spending: assigned money by tag, with every purchase
 * taken from the account that paid for it first (see pocketBalances). Positive parts only.
 */
export async function loadPocketBalances(db: Db, workspaceId: string, categoryIds: string[], month: Date): Promise<Map<string, Parts>> {
  const out = new Map<string, Parts>();
  if (categoryIds.length === 0) return out;
  const end = new Date(addMonthsUTC(month, 1).getTime());
  const wanted = new Set(categoryIds);
  const [tags, spend, accounts] = await Promise.all([
    loadPocketTags(db, categoryIds, month),
    db.$queryRaw<{ accountId: string; categoryId: string | null; s: bigint }[]>(Prisma.sql`
      SELECT t."accountId", COALESCE(sp."categoryId", t."categoryId") AS "categoryId", SUM(COALESCE(sp."amountCents", t."amountCents")) AS s
      FROM transactions t LEFT JOIN transaction_splits sp ON sp."transactionId" = t.id
      WHERE t."workspaceId" = ${workspaceId} AND t.date < ${end} AND t."transferGroupId" IS NULL
      GROUP BY 1, 2`),
    db.account.findMany({ where: { workspaceId, onBudget: true, balanceMode: "TRANSACTION_DERIVED", type: { not: "CREDIT_CARD" } }, select: { id: true } }),
  ]);
  const cash = new Set(accounts.map((a) => a.id));
  const activity = new Map<string, Parts>();
  for (const r of spend) {
    if (!r.categoryId || !wanted.has(r.categoryId)) continue;
    const list = activity.get(r.categoryId) ?? [];
    list.push([r.accountId, Number(r.s)]);
    activity.set(r.categoryId, list);
  }
  for (const id of categoryIds) out.set(id, pocketBalances(tags.get(id) ?? [], activity.get(id) ?? [], cash));
  return out;
}

export interface FundInput { categoryId: string; month: Date; amountCents: number; source: AssignmentSource; note?: string; waterfallRunId?: string }

/**
 * Rows for money leaving Ready to assign into pockets. Each amount is drawn from the accounts' ready cash
 * (the preferred account first, then the biggest), so a row may become several tagged rows.
 * If the pools can't cover it (over-assigning), the rest is tagged to the preferred or biggest account.
 */
export async function fundRows(db: Db, workspaceId: string, asOf: Date, inputs: FundInput[], prefer?: string | null): Promise<NewRow[]> {
  const pools = await loadPools(db, workspaceId, asOf);
  const rows: NewRow[] = [];
  for (const inp of inputs) {
    if (inp.amountCents <= 0) { rows.push({ ...inp, amountCents: inp.amountCents, fundingAccountId: null }); continue; }
    const { parts, shortCents } = drawFromPools([...pools], inp.amountCents, prefer);
    for (const [k, n] of parts) pools.set(k, (pools.get(k) ?? 0) - n);
    if (shortCents > 0) {
      const fallback = prefer ?? ([...pools].filter(([k]) => k !== null).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
      parts.push([fallback, shortCents]);
      pools.set(fallback, (pools.get(fallback) ?? 0) - shortCents);
    }
    for (const [k, n] of parts) rows.push({ categoryId: inp.categoryId, month: inp.month, amountCents: n, source: inp.source, note: inp.note, waterfallRunId: inp.waterfallRunId, fundingAccountId: k });
  }
  return rows;
}

/** Splits `cents` taken out of a pocket across the accounts its money is tagged to (in proportion). */
export async function takeFromPocket(db: Db, workspaceId: string, categoryId: string, tagsAsOf: Date, cents: number): Promise<Parts> {
  const tags = (await loadPocketBalances(db, workspaceId, [categoryId], tagsAsOf)).get(categoryId) ?? [];
  const parts = splitProRata(tags, cents);
  return parts.length > 0 ? parts : [[null, cents]];
}

/** Rows that release `cents` from a pocket back to Ready to assign, each carrying its account tag. */
export async function releaseRows(db: Db, a: { workspaceId: string; categoryId: string; month: Date; cents: number; source: AssignmentSource; note?: string }): Promise<NewRow[]> {
  const parts = await takeFromPocket(db, a.workspaceId, a.categoryId, a.month, a.cents);
  return parts.map(([k, n]) => ({ categoryId: a.categoryId, month: a.month, amountCents: -n, source: a.source, note: a.note, fundingAccountId: k }));
}

/** Rows that move `cents` from one pocket to another; the account tags travel with the money. */
export async function moveRows(db: Db, a: { workspaceId: string; fromId: string; toId: string; month: Date; cents: number; source: AssignmentSource; noteFrom?: string; noteTo?: string }): Promise<NewRow[]> {
  const parts = await takeFromPocket(db, a.workspaceId, a.fromId, a.month, a.cents);
  return parts.flatMap(([k, n]): NewRow[] => [
    { categoryId: a.fromId, month: a.month, amountCents: -n, source: a.source, note: a.noteFrom, fundingAccountId: k },
    { categoryId: a.toId, month: a.month, amountCents: n, source: a.source, note: a.noteTo, fundingAccountId: k },
  ]);
}

// ---------------------------------------------------------------------------
// The "Where's my cash" view
// ---------------------------------------------------------------------------

export interface CashAccount {
  id: string; name: string; type: string;
  /** What the bank account really holds (starting balance + every transaction to the end of the month). */
  realCents: number;
  /** Ready to assign that sits in this account. */
  readyCents: number;
  /** Pocket money tagged to this account. */
  pocketsCents: number;
  /** The household member who looks after the account (null = none). */
  stewardId: string | null;
  stewardName: string | null;
}
export interface CashView {
  accounts: CashAccount[];
  /** pocket id -> account id (or "none") -> cents. Sums to the pocket's available money. */
  byPocket: Record<string, Record<string, number>>;
  /** Pocket money not yet tagged to an account, and Ready to assign that is "owed" to it. */
  untaggedPocketCents: number;
  /** Credit card balances owed (positive number). */
  cardsOwedCents: number;
}

export async function loadCashView(db: Db, workspaceId: string, month: Date, pockets: { id: string; availableCents: number }[]): Promise<CashView> {
  const end = endOfMonth(month);
  const periodEnd = new Date(end.getTime() + 1);
  const [accounts, txSums, pools, balances] = await Promise.all([
    db.account.findMany({ where: { workspaceId, onBudget: true, isArchived: false, balanceMode: "TRANSACTION_DERIVED" }, orderBy: { name: "asc" }, include: { steward: { select: { name: true, email: true } } } }),
    db.transaction.groupBy({ by: ["accountId"], where: { workspaceId, date: { lt: periodEnd } }, _sum: { amountCents: true } }),
    loadPools(db, workspaceId, end),
    loadPocketBalances(db, workspaceId, pockets.map((p) => p.id), month),
  ]);
  const tx = new Map(txSums.map((r) => [r.accountId, r._sum.amountCents ?? 0]));
  const real = (a: (typeof accounts)[number]) => (!a.openingBalanceDate || a.openingBalanceDate < periodEnd ? a.openingBalanceCents : 0) + (tx.get(a.id) ?? 0);

  const byPocket: CashView["byPocket"] = {};
  const pocketTotals = new Map<string, number>();
  let untagged = 0;
  for (const p of pockets) {
    const shares = pocketShares(balances.get(p.id) ?? [], p.availableCents);
    if (shares.length === 0) continue;
    const m: Record<string, number> = {};
    for (const [k, n] of shares) {
      m[k ?? "none"] = n;
      if (k === null) untagged += n; else pocketTotals.set(k, (pocketTotals.get(k) ?? 0) + n);
    }
    byPocket[p.id] = m;
  }
  const cash = accounts.filter((a) => a.type !== "CREDIT_CARD");
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD");
  return {
    accounts: cash.map((a) => ({ id: a.id, name: a.name, type: a.type, realCents: real(a), readyCents: pools.get(a.id) ?? 0, pocketsCents: pocketTotals.get(a.id) ?? 0, stewardId: a.stewardId, stewardName: a.steward ? (a.steward.name?.trim() || a.steward.email.split("@")[0]) : null })),
    byPocket,
    untaggedPocketCents: untagged,
    cardsOwedCents: cards.reduce((s, a) => s + Math.max(0, -real(a)), 0),
  };
}

/** Every spending pocket's money by account tag (spending applied), for the whole workspace. */
export async function loadAllPocketBalances(db: Db, workspaceId: string, month: Date): Promise<Map<string, Parts>> {
  const cats = await db.category.findMany({ where: { workspaceId, isArchived: false, type: { not: "INCOME" } }, select: { id: true } });
  return loadPocketBalances(db, workspaceId, cats.map((c) => c.id), month);
}

/** Two offsetting rows that re-tag `cents` of a pocket's money from one account to another (null = not tagged). Pocket totals don't change. */
export function retagRows(a: { categoryId: string; month: Date; cents: number; from: Key; to: Key; note: string }): NewRow[] {
  return [
    { categoryId: a.categoryId, month: a.month, amountCents: -a.cents, source: "CORRECTION", note: a.note, fundingAccountId: a.from },
    { categoryId: a.categoryId, month: a.month, amountCents: a.cents, source: "CORRECTION", note: a.note, fundingAccountId: a.to },
  ];
}
