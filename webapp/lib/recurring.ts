import "server-only";
import { prisma } from "@/lib/prisma";
import { dueDates, isFrequency, nextOccurrence, type Frequency } from "@/lib/recurring-math";
import { isoToDate, todayIso } from "@/lib/utils/dates";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface RecurringVM {
  id: string; accountId: string; accountName: string; categoryId: string | null; categoryName: string | null;
  payee: string; memo: string | null; amountCents: number; frequency: Frequency; nextDate: string; endDate: string | null;
  autoPost: boolean; isDeductible: boolean; isActive: boolean; dueDates: string[]; anchorDay: number;
}

/** Every repeating item in a workspace, with the dates that are due now. Empty when the table isn't created yet. */
export async function loadRecurring(workspaceId: string, today = todayIso()): Promise<RecurringVM[]> {
  try {
    const items = await prisma.recurringItem.findMany({ where: { workspaceId }, include: { account: { select: { name: true, isArchived: true } } }, orderBy: [{ isActive: "desc" }, { nextDate: "asc" }] });
    const cats = await prisma.category.findMany({ where: { workspaceId, id: { in: items.map((i) => i.categoryId).filter((c): c is string => !!c) } }, select: { id: true, name: true } });
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    return items.map((i) => {
      const freq: Frequency = isFrequency(i.frequency) ? i.frequency : "MONTHLY";
      const next = iso(i.nextDate);
      return {
        id: i.id, accountId: i.accountId, accountName: i.account.name, categoryId: i.categoryId && catName.has(i.categoryId) ? i.categoryId : null,
        categoryName: i.categoryId ? catName.get(i.categoryId) ?? null : null, payee: i.payee, memo: i.memo, amountCents: i.amountCents, frequency: freq,
        nextDate: next, endDate: i.endDate ? iso(i.endDate) : null, anchorDay: i.anchorDay, autoPost: i.autoPost, isDeductible: i.isDeductible, isActive: i.isActive && !i.account.isArchived,
        dueDates: i.isActive && !i.account.isArchived ? dueDates(next, freq, i.anchorDay, today, i.endDate ? iso(i.endDate) : null) : [],
      };
    });
  } catch { return []; }
}

/** Posts every due occurrence of the given items (all active ones due when no ids are given). Returns how many transactions were made. */
export async function postDue(workspaceId: string, opts: { ids?: string[]; onlyAuto?: boolean; today?: string; personId?: string | null } = {}): Promise<number> {
  const today = opts.today ?? todayIso();
  let made = 0;
  try {
    const items = await prisma.recurringItem.findMany({
      where: { workspaceId, isActive: true, nextDate: { lte: isoToDate(today) }, ...(opts.ids ? { id: { in: opts.ids } } : {}), ...(opts.onlyAuto ? { autoPost: true } : {}) },
      include: { account: { select: { isArchived: true } } },
    });
    for (const it of items) {
      if (it.account.isArchived || !isFrequency(it.frequency)) continue;
      const freq = it.frequency;
      const end = it.endDate ? iso(it.endDate) : null;
      const dates = dueDates(iso(it.nextDate), freq, it.anchorDay, today, end);
      if (dates.length === 0) { if (end && iso(it.nextDate) > end) await prisma.recurringItem.update({ where: { id: it.id }, data: { isActive: false } }); continue; }
      const following = nextOccurrence(dates[dates.length - 1], freq, it.anchorDay);
      // Claim the dates first, so a second request at the same moment can't post them twice.
      const claim = await prisma.recurringItem.updateMany({ where: { id: it.id, nextDate: it.nextDate }, data: { nextDate: isoToDate(following), lastPostedDate: isoToDate(dates[dates.length - 1]), ...(end && following > end ? { isActive: false } : {}) } });
      if (claim.count === 0) continue;
      const cat = it.categoryId ? await prisma.category.findFirst({ where: { id: it.categoryId, workspaceId, isArchived: false }, select: { id: true } }) : null;
      const payee = await prisma.payee.upsert({ where: { workspaceId_name: { workspaceId, name: it.payee } }, update: {}, create: { workspaceId, name: it.payee, defaultCategoryId: cat?.id ?? null } });
      await prisma.transaction.createMany({ data: dates.map((d) => ({
        workspaceId, accountId: it.accountId, categoryId: cat?.id ?? null, payeeId: payee.id, amountCents: it.amountCents, date: isoToDate(d),
        memo: it.memo, clearedStatus: "UNCLEARED" as const, isTaxDeductible: it.isDeductible && !!cat && it.amountCents < 0, needsReview: !cat, personId: opts.personId ?? null,
      })) });
      made += dates.length;
    }
  } catch { /* table not created yet */ }
  return made;
}

/** Moves due items past today without posting anything (for charges that didn't happen). */
export async function skipDue(workspaceId: string, id: string, today = todayIso()): Promise<void> {
  const it = await prisma.recurringItem.findFirst({ where: { id, workspaceId } });
  if (!it || !isFrequency(it.frequency)) return;
  let cur = iso(it.nextDate);
  const end = it.endDate ? iso(it.endDate) : null;
  let guard = 0;
  while (cur <= today && guard++ < 400) cur = nextOccurrence(cur, it.frequency, it.anchorDay);
  await prisma.recurringItem.update({ where: { id }, data: { nextDate: isoToDate(cur), ...(end && cur > end ? { isActive: false } : {}) } });
}

export interface Suggestion { key: string; payee: string; amountCents: number; frequency: Frequency; nextDate: string; accountId: string; accountName: string; categoryId: string | null; categoryName: string | null; count: number }

/** Charges in the last 14 months that repeat on a schedule but aren't set up yet, ready to be added in one tap. */
export async function suggestRecurring(workspaceId: string, existing: RecurringVM[], today = todayIso()): Promise<Suggestion[]> {
  const { analyzeLeaks, payeeKey } = await import("@/lib/coach/leaks-math");
  const from = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1 - 14, 1));
  const txs = await prisma.transaction.findMany({
    where: { workspaceId, amountCents: { lt: 0 }, transferGroupId: null, payeeId: { not: null }, date: { gte: from }, account: { isArchived: false, balanceMode: "TRANSACTION_DERIVED" } },
    select: { date: true, amountCents: true, accountId: true, categoryId: true, payee: { select: { name: true } }, account: { select: { name: true } } },
    orderBy: { date: "desc" }, take: 5000,
  });
  const report = analyzeLeaks(txs.map((t) => ({ payee: t.payee!.name, date: iso(t.date), cents: -t.amountCents })), today);
  const have = new Set(existing.map((e) => payeeKey(e.payee)));
  const cats = await prisma.category.findMany({ where: { workspaceId, isArchived: false }, select: { id: true, name: true } });
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const freqOf = { monthly: "MONTHLY", quarterly: "QUARTERLY", yearly: "YEARLY" } as const;
  const out: Suggestion[] = [];
  for (const r of report.recurring) {
    if (!r.active || have.has(r.key)) continue;
    const last = txs.find((t) => payeeKey(t.payee!.name) === r.key);
    if (!last) continue;
    const freq: Frequency = freqOf[r.cadence];
    const anchor = +iso(last.date).slice(8, 10);
    let next = iso(last.date), guard = 0;
    while (next <= today && guard++ < 60) next = nextOccurrence(next, freq, anchor);
    out.push({ key: r.key, payee: last.payee!.name, amountCents: -last.amountCents, frequency: freq, nextDate: next, accountId: last.accountId, accountName: last.account.name, categoryId: last.categoryId && catName.has(last.categoryId) ? last.categoryId : null, categoryName: last.categoryId ? catName.get(last.categoryId) ?? null : null, count: r.count });
  }
  return out.slice(0, 12);
}
