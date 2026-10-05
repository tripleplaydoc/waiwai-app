import "server-only";
import { prisma } from "@/lib/prisma";
import { analyzeLeaks, type LeakReport, type Spend } from "@/lib/coach/leaks-math";
import { dateToIso } from "@/lib/utils/dates";

export interface LeakageMonth { month: string; cents: number; spendCents: number }
export interface LeaksVM { report: LeakReport; leakage: LeakageMonth[]; historyUsed: boolean; spendRows: number }

const monthsBack = (today: string, n: number) => {
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
};

/** Recurring charges, price increases, double charges and the Leakage trend, from the live budget plus imported history. */
export async function loadLeaks(workspaceId: string, today: string): Promise<LeaksVM> {
  const from = monthsBack(today, 26);
  const live = await prisma.transaction.findMany({
    where: { workspaceId, amountCents: { lt: 0 }, transferGroupId: null, date: { gte: new Date(`${from}T00:00:00.000Z`) } },
    select: { date: true, amountCents: true, tags: true, payee: { select: { name: true } }, memo: true },
    take: 30000,
  });
  let hist: { date: Date; amountCents: number; payee: string }[] = [];
  try {
    hist = await prisma.historicalTransaction.findMany({
      where: { workspaceId, kind: "EXPENSE", amountCents: { lt: 0 }, date: { gte: new Date(`${from}T00:00:00.000Z`) } },
      select: { date: true, amountCents: true, payee: true }, take: 30000,
    });
  } catch { /* History tables not created yet */ }

  const spends: Spend[] = [
    ...live.map((t) => ({ payee: t.payee?.name ?? "", date: dateToIso(t.date), cents: -t.amountCents })),
    ...hist.map((t) => ({ payee: t.payee, date: dateToIso(t.date), cents: -t.amountCents })),
  ].filter((s) => s.payee);

  const months: LeakageMonth[] = [];
  for (let i = 5; i >= 0; i--) months.push({ month: monthsBack(today, i).slice(0, 7), cents: 0, spendCents: 0 });
  const slot = new Map(months.map((m) => [m.month, m]));
  for (const t of live) {
    const m = slot.get(dateToIso(t.date).slice(0, 7));
    if (!m) continue;
    m.spendCents += -t.amountCents;
    if (t.tags.includes("LEAKAGE")) m.cents += -t.amountCents;
  }
  return { report: analyzeLeaks(spends, today), leakage: months, historyUsed: hist.length > 0, spendRows: spends.length };
}
