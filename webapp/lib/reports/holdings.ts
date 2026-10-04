import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { holdingOf, holdingSide, type HoldingKey } from "@/lib/holdings";

export type HoldingView = "monthly" | "quarterly" | "annual";
export interface HoldingRow {
  id: string; workspaceId: string; name: string; cls: HoldingKey; side: "ASSET" | "LIABILITY";
  onBudget: boolean; manual: boolean; monthlyCashflowCents: number;
  /** Positive worth for assets; positive amount owed for liabilities. */
  valueCents: number;
}
export interface PeriodPoint { label: string; end: string; assetsCents: number; liabilitiesCents: number; netCents: number; byClass: Partial<Record<HoldingKey, number>> }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (y: number, m: number, n: number) => new Date(Date.UTC(y, m + n, 1));

/** Period end dates, oldest first, ending with `today` for the current (partial) period. */
export function periodEnds(view: HoldingView, today: string, count: number): { label: string; end: string }[] {
  const y = +today.slice(0, 4), m = +today.slice(5, 7) - 1;
  const out: { label: string; end: string }[] = [];
  const mon = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  if (view === "monthly") {
    for (let i = count - 1; i >= 0; i--) {
      const start = addMonths(y, m, -i), next = addMonths(y, m, -i + 1);
      const end = i === 0 ? today : iso(new Date(next.getTime() - 86_400_000));
      out.push({ label: `${mon(start)}${start.getUTCMonth() === 0 || i === count - 1 ? ` ’${String(start.getUTCFullYear()).slice(2)}` : ""}`, end });
    }
  } else if (view === "quarterly") {
    const q0 = Math.floor(m / 3) * 3;
    for (let i = count - 1; i >= 0; i--) {
      const start = addMonths(y, q0, -3 * i), next = addMonths(y, q0, -3 * i + 3);
      const end = i === 0 ? today : iso(new Date(next.getTime() - 86_400_000));
      out.push({ label: `Q${Math.floor(start.getUTCMonth() / 3) + 1} ’${String(start.getUTCFullYear()).slice(2)}`, end });
    }
  } else {
    for (let i = count - 1; i >= 0; i--) out.push({ label: String(y - i), end: i === 0 ? today : `${y - i}-12-31` });
  }
  return out;
}

interface Acct { id: string; workspaceId: string; name: string; type: string; holdingClass: string | null; onBudget: boolean; balanceMode: string; openingBalanceCents: number; openingBalanceDate: Date | null; monthlyCashflowCents: number | null }

/** Balance of every account at each of the given dates (ascending). One query for transactions, one for valuations. */
export async function balancesAt(accounts: Acct[], dates: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (accounts.length === 0) return out;
  const ids = accounts.map((a) => a.id);
  const derived = accounts.filter((a) => a.balanceMode !== "MANUAL").map((a) => a.id);
  const manualIds = accounts.filter((a) => a.balanceMode === "MANUAL").map((a) => a.id);
  const [txRows, manualRows] = await Promise.all([
    derived.length
      ? prisma.$queryRaw<{ accountId: string; d: Date; s: bigint }[]>(Prisma.sql`SELECT "accountId", date AS d, SUM("amountCents") AS s FROM transactions WHERE "accountId" IN (${Prisma.join(derived)}) GROUP BY "accountId", date`)
      : Promise.resolve([]),
    manualIds.length ? prisma.manualBalanceEntry.findMany({ where: { accountId: { in: manualIds } }, orderBy: { asOfDate: "asc" } }) : Promise.resolve([]),
  ]);
  void ids;
  for (const a of accounts) {
    const series: number[] = [];
    if (a.balanceMode === "MANUAL") {
      const entries = manualRows.filter((e) => e.accountId === a.id);
      for (const d of dates) {
        let v = 0;
        for (const e of entries) if (iso(e.asOfDate) <= d) v = e.balanceCents;
        series.push(v);
      }
    } else {
      const tx = txRows.filter((t) => t.accountId === a.id).map((t) => ({ d: iso(t.d), s: Number(t.s) }));
      const openIso = a.openingBalanceDate ? iso(a.openingBalanceDate) : null;
      for (const d of dates) {
        let v = !openIso || openIso <= d ? a.openingBalanceCents : 0;
        for (const t of tx) if (t.d <= d) v += t.s;
        series.push(v);
      }
    }
    out.set(a.id, series);
  }
  return out;
}

export async function loadHoldings(workspaceIds: string[], today: string, view: HoldingView, count: number) {
  const accounts = await prisma.account.findMany({ where: { workspaceId: { in: workspaceIds }, isArchived: false }, orderBy: [{ name: "asc" }] });
  const ends = periodEnds(view, today, count);
  const bal = await balancesAt(accounts, ends.map((e) => e.end));
  const points: PeriodPoint[] = ends.map((e, i) => {
    let assets = 0, liab = 0;
    const byClass: PeriodPoint["byClass"] = {};
    for (const a of accounts) {
      const cls = holdingOf(a), side = holdingSide(cls);
      const raw = bal.get(a.id)![i];
      const v = side === "ASSET" ? raw : -raw;
      byClass[cls] = (byClass[cls] ?? 0) + v;
      if (side === "ASSET") assets += raw; else liab += -raw;
    }
    return { label: e.label, end: e.end, assetsCents: assets, liabilitiesCents: liab, netCents: assets - liab, byClass };
  });
  const last = ends.length - 1;
  const rows: HoldingRow[] = accounts.map((a) => {
    const cls = holdingOf(a), side = holdingSide(cls);
    const raw = bal.get(a.id)![last];
    return { id: a.id, workspaceId: a.workspaceId, name: a.name, cls, side, onBudget: a.onBudget, manual: a.balanceMode === "MANUAL", monthlyCashflowCents: a.monthlyCashflowCents ?? 0, valueCents: side === "ASSET" ? raw : -raw };
  });
  const prevRaw = (id: string, cls: HoldingKey) => { const v = bal.get(id)![Math.max(0, last - 1)]; return holdingSide(cls) === "ASSET" ? v : -v; };
  const prevById = new Map(accounts.map((a) => [a.id, prevRaw(a.id, holdingOf(a))]));
  return { points, rows, prevById, accounts };
}

/** Every account's worth (assets) / amount owed (liabilities) on one date. */
export async function holdingsAt(workspaceIds: string[], date: string): Promise<HoldingRow[]> {
  const accounts = await prisma.account.findMany({ where: { workspaceId: { in: workspaceIds }, isArchived: false }, orderBy: [{ name: "asc" }] });
  const bal = await balancesAt(accounts, [date]);
  return accounts.map((a) => {
    const cls = holdingOf(a), side = holdingSide(cls);
    const raw = bal.get(a.id)![0];
    return { id: a.id, workspaceId: a.workspaceId, name: a.name, cls, side, onBudget: a.onBudget, manual: a.balanceMode === "MANUAL", monthlyCashflowCents: a.monthlyCashflowCents ?? 0, valueCents: side === "ASSET" ? raw : -raw };
  });
}
