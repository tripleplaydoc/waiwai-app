import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPnl } from "@/lib/reports/pnl";
import { typeLabel } from "@/lib/budget/expense-types";
import { bridge, deductibleAmount, type BridgeResult, type YearSummary, type YearTypeRow } from "@/lib/history-math";
import { dateToIso, todayIso } from "@/lib/utils/dates";

export interface HistoryAccountVM {
  id: string; name: string; type: string;
  count: number; firstDate: string | null; lastDate: string | null; netCents: number;
  startDate: string | null; startCents: number | null; openingCents: number;
  /** History for this account must end before this day (go-live, or its first live transaction if earlier). */
  cutoff: string;
  bridge: BridgeResult;
}
export interface PayeeToClassify { payee: string; count: number; outCents: number; inCents: number }
export interface HistoryVM {
  ready: boolean;
  goLive: string | null;
  accounts: HistoryAccountVM[];
  years: YearSummary[];
  payees: PayeeToClassify[];
  totalRows: number;
}

/** False until the History tables exist (the migration has been run). */
export async function historyReady(): Promise<boolean> {
  try { await prisma.historySettings.count(); return true; } catch { return false; }
}

export async function getGoLive(workspaceId: string): Promise<string | null> {
  const s = await prisma.historySettings.findUnique({ where: { workspaceId } });
  return s ? dateToIso(s.goLiveDate) : null;
}

/** Per account: the day history must end before = min(go-live, first live transaction). */
export async function cutoffsFor(workspaceId: string, goLive: string): Promise<Map<string, string>> {
  const first = await prisma.transaction.groupBy({ by: ["accountId"], where: { workspaceId }, _min: { date: true } });
  const m = new Map<string, string>();
  for (const f of first) if (f._min.date) { const iso = dateToIso(f._min.date); m.set(f.accountId, iso < goLive ? iso : goLive); }
  return m;
}

const plusRows = (m: Map<string, YearTypeRow>, key: string, cents: number) => {
  const cur = m.get(key) ?? { key, label: typeLabel(key) ?? "Unclassified", cents: 0 };
  cur.cents += cents; m.set(key, cur);
};

export async function loadHistory(workspaceId: string, isBusiness: boolean): Promise<HistoryVM> {
  const goLive = await getGoLive(workspaceId);
  const empty: HistoryVM = { ready: true, goLive, accounts: [], years: [], payees: [], totalRows: 0 };
  if (!goLive) return empty;

  const [accounts, starts, per, cutoffs, rows, payees, firstLive] = await Promise.all([
    prisma.account.findMany({ where: { workspaceId, isArchived: false }, orderBy: [{ onBudget: "desc" }, { name: "asc" }] }),
    prisma.historyAccount.findMany({ where: { workspaceId } }),
    prisma.historicalTransaction.groupBy({ by: ["accountId"], where: { workspaceId }, _count: { _all: true }, _sum: { amountCents: true }, _min: { date: true }, _max: { date: true } }),
    cutoffsFor(workspaceId, goLive),
    prisma.$queryRaw<{ year: number; kind: string; typeKey: string | null; ded: boolean; cents: bigint; n: bigint }[]>(Prisma.sql`
      SELECT EXTRACT(YEAR FROM "date")::int AS year, kind, "typeKey", "isTaxDeductible" AS ded, SUM("amountCents") AS cents, COUNT(*) AS n
      FROM historical_transactions WHERE "workspaceId" = ${workspaceId} AND kind <> 'TRANSFER'
      GROUP BY 1, 2, 3, 4`),
    prisma.$queryRaw<{ payee: string; n: bigint; outc: bigint; inc: bigint }[]>(Prisma.sql`
      SELECT payee, COUNT(*) AS n,
        COALESCE(SUM(CASE WHEN "amountCents" < 0 THEN -"amountCents" ELSE 0 END), 0) AS outc,
        COALESCE(SUM(CASE WHEN "amountCents" > 0 THEN "amountCents" ELSE 0 END), 0) AS inc
      FROM historical_transactions WHERE "workspaceId" = ${workspaceId} AND "typeKey" IS NULL AND kind <> 'TRANSFER' AND payee <> ''
      GROUP BY payee ORDER BY (COALESCE(SUM(ABS("amountCents")), 0)) DESC LIMIT 25`),
    prisma.transaction.aggregate({ where: { workspaceId }, _min: { date: true } }),
  ]);

  const rowsBy = new Map(per.map((p) => [p.accountId, p]));
  const startBy = new Map(starts.map((s) => [s.accountId, s]));
  const accountRows = await prisma.historicalTransaction.findMany({ where: { workspaceId }, select: { accountId: true, amountCents: true } });
  const amounts = new Map<string, number[]>();
  for (const r of accountRows) amounts.set(r.accountId, [...(amounts.get(r.accountId) ?? []), r.amountCents]);

  const vm: HistoryAccountVM[] = accounts
    .filter((a) => a.balanceMode === "TRANSACTION_DERIVED" || rowsBy.has(a.id))
    .map((a) => {
      const p = rowsBy.get(a.id), s = startBy.get(a.id);
      const net = p?._sum.amountCents ?? 0;
      const startCents = s ? s.startBalanceCents : null;
      return {
        id: a.id, name: a.name, type: a.type,
        count: p?._count._all ?? 0, firstDate: p?._min.date ? dateToIso(p._min.date) : null, lastDate: p?._max.date ? dateToIso(p._max.date) : null, netCents: net,
        startDate: s?.startDate ? dateToIso(s.startDate) : null, startCents, openingCents: a.openingBalanceCents,
        cutoff: cutoffs.get(a.id) ?? goLive,
        bridge: bridge({ startBalanceCents: startCents, historyNetCents: net, openingCents: a.openingBalanceCents, rowAmounts: amounts.get(a.id) ?? [] }),
      };
    });

  // Years: history rows plus the live budget (so the current year reads as one full year).
  const byYear = new Map<number, { rev: Map<string, YearTypeRow>; exp: Map<string, YearTypeRow>; ded: number; uncN: number; uncC: number; n: number; live: boolean }>();
  const slot = (y: number) => { let s = byYear.get(y); if (!s) { s = { rev: new Map(), exp: new Map(), ded: 0, uncN: 0, uncC: 0, n: 0, live: false }; byYear.set(y, s); } return s; };
  for (const r of rows) {
    const s = slot(r.year); const cents = Number(r.cents); const n = Number(r.n);
    s.n += n;
    const key = r.typeKey ?? "UNCLASSIFIED";
    if (r.kind === "INCOME") plusRows(s.rev, key, cents);
    else {
      plusRows(s.exp, key, -cents);
      if (r.ded) s.ded += deductibleAmount(-cents, r.typeKey);
    }
    if (!r.typeKey) { s.uncN += n; s.uncC += Math.abs(cents); }
  }
  const nowYear = Number(todayIso().slice(0, 4));
  const liveFrom = firstLive._min.date ? dateToIso(firstLive._min.date) : null;
  if (liveFrom) {
    for (let y = Number(liveFrom.slice(0, 4)); y <= nowYear; y++) {
      const pnl = await buildPnl(workspaceId, { from: `${y}-01-01`, to: `${y}-12-31`, prevFrom: `${y - 1}-01-01`, prevTo: `${y - 1}-12-31` });
      const s = slot(y); s.live = true;
      for (const r of pnl.revenue) plusRows(s.rev, r.key.startsWith("UNCLASSIFIED") ? "UNCLASSIFIED" : r.key, r.cents);
      for (const r of pnl.expenses) plusRows(s.exp, r.key === "UNCLASSIFIED" ? "UNCLASSIFIED" : r.key, r.cents);
      s.ded += pnl.deductibleCents;
    }
  }
  const sum = (m: Map<string, YearTypeRow>) => [...m.values()].sort((a, b) => b.cents - a.cents);
  const years: YearSummary[] = [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, s]) => {
    const revenue = sum(s.rev), expenses = sum(s.exp);
    const revenueCents = revenue.reduce((t, r) => t + r.cents, 0), expenseCents = expenses.reduce((t, r) => t + r.cents, 0);
    return { year, revenueCents, expenseCents, netCents: revenueCents - expenseCents, deductibleCents: s.ded, revenue, expenses, unclassifiedCount: s.uncN, unclassifiedCents: s.uncC, historyRows: s.n, includesLive: s.live };
  });

  return {
    ready: true, goLive, accounts: vm, years,
    payees: payees.map((p) => ({ payee: p.payee, count: Number(p.n), outCents: Number(p.outc), inCents: Number(p.inc) })),
    totalRows: per.reduce((t, p) => t + p._count._all, 0),
  };
}
