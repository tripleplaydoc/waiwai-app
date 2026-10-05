import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isoToDate, todayIso } from "@/lib/utils/dates";
import { valueCents } from "./math";
import { lookupPrices, type Fetcher, realFetch } from "./providers";

export interface RefreshSummary { updated: number; failed: string[]; accounts: number; skipped: number }

const dec = (d: Prisma.Decimal | null | undefined) => (d ? d.toFixed() : null);

/** Worth of an account that is made of priced positions: coins/shares at the last price, plus any cash. */
export async function accountPositionValue(accountId: string): Promise<{ cents: number; unpriced: string[]; count: number }> {
  const [positions, detail] = await Promise.all([
    prisma.holdingPosition.findMany({ where: { accountId } }),
    prisma.holdingDetail.findUnique({ where: { accountId } }),
  ]);
  let cents = detail?.cashCents ?? 0;
  const unpriced: string[] = [];
  for (const p of positions) {
    const price = dec(p.lastPrice);
    if (!price) { unpriced.push(p.symbol); continue; }
    cents += valueCents(p.quantity.toFixed(), price);
  }
  return { cents, unpriced, count: positions.length };
}

/**
 * Saves today's total as the account's value (one snapshot per day, so reports can chart growth).
 * Skipped while a position still has no price at all, rather than recording a number that is too low.
 */
export async function snapshotAccountValue(accountId: string, today = todayIso()): Promise<boolean> {
  const { cents, unpriced, count } = await accountPositionValue(accountId);
  if (count === 0 || unpriced.length > 0) return false;
  const when = isoToDate(today);
  await prisma.$transaction([
    prisma.manualBalanceEntry.deleteMany({ where: { accountId, asOfDate: when } }),
    prisma.manualBalanceEntry.create({ data: { accountId, asOfDate: when, balanceCents: cents, note: "Auto-priced" } }),
  ]);
  return true;
}

/** Fetch current prices for every position in scope, store them, and re-snapshot the affected accounts. */
export async function refreshPrices(o: { workspaceIds?: string[]; accountId?: string; maxAgeMs?: number; fetcher?: Fetcher } = {}): Promise<RefreshSummary> {
  const positions = await prisma.holdingPosition.findMany({
    where: { account: { isArchived: false, ...(o.workspaceIds ? { workspaceId: { in: o.workspaceIds } } : {}), ...(o.accountId ? { id: o.accountId } : {}) } },
  });
  const cutoff = o.maxAgeMs ? Date.now() - o.maxAgeMs : null;
  const due = positions.filter((p) => !cutoff || !p.priceAt || p.priceAt.getTime() < cutoff);
  if (due.length === 0) return { updated: 0, failed: [], accounts: 0, skipped: positions.length };

  const found = await lookupPrices(due.map((p) => ({ kind: p.kind, symbol: p.symbol })), o.fetcher ?? realFetch);
  const now = new Date();
  const failed = new Set<string>();
  let updated = 0;
  for (const p of due) {
    const hit = found.get(`${p.kind}:${p.symbol}`);
    if (!hit) { failed.add(p.symbol); continue; }
    await prisma.holdingPosition.update({ where: { id: p.id }, data: { lastPrice: hit.price, priceAt: now, priceSource: hit.source, ...(p.name ? {} : hit.name ? { name: hit.name } : {}) } });
    updated++;
  }
  const accounts = [...new Set(due.map((p) => p.accountId))];
  for (const id of accounts) await snapshotAccountValue(id);
  return { updated, failed: [...failed], accounts: accounts.length, skipped: positions.length - due.length };
}
