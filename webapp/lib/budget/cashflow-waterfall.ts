/**
 * Cashflow waterfall — pure math, integer cents, no database.
 *
 *   Ready to assign
 *     1. pays back anything previously pulled from a reserve (oldest first)
 *     2. splits what is left: taxBps → Taxes, the rest → OPEX
 *     3. OPEX pockets fill up to their monthly targets; extra overflows to Reservoir 1
 *     4. Reservoir 1 fills to (months × monthly OPEX); extra splits reservoir2ShareBps → Reservoir 2, rest → Cash
 *     5. Reservoir 2 fills to (months × monthly OPEX); whatever it can't take goes to Cash
 *     6. Cash is shared among its pockets by cashShareBps; any part not given a percentage stays in Ready to assign
 *
 * Covering an OPEX shortfall pulls 50/50 from Taxes and Reservoir 1 first, then Reservoir 2.
 */
import { distribute } from "./allocation";

export type Bucket = "TAXES" | "RESERVOIR_1" | "RESERVOIR_2";

export interface OpexPocketState { id: string; needCents: number } // need = target − available (>= 0)
export interface CashPocketState { id: string; bps: number }
export interface OutstandingDraw { id: string; bucket: Bucket; outstandingCents: number } // oldest first

export interface AssignInput {
  readyCents: number;
  taxBps: number;
  opex: OpexPocketState[];
  monthlyOpexCents: number;
  taxId: string;
  reservoir1: { id: string; balanceCents: number; months: number };
  reservoir2: { id: string; balanceCents: number; months: number; shareBps: number };
  cash: CashPocketState[];
  draws: OutstandingDraw[];
}

export interface Move { categoryId: string; cents: number; kind: "REPAY" | "TAXES" | "OPEX" | "RESERVOIR_1" | "RESERVOIR_2" | "CASH" }
export interface AssignPlan {
  moves: Move[];                       // each > 0
  repayments: { drawId: string; cents: number }[];
  totals: { repay: number; taxes: number; opex: number; reservoir1: number; reservoir2: number; cash: number };
  leftoverCents: number;               // stays in the pool
  opexFilled: boolean;
  reservoir1Filled: boolean;
  reservoir2Filled: boolean;
}

/** months × monthly cost, rounded to a cent. `months` may be fractional (2.5). */
export function reserveTarget(monthlyOpexCents: number, months: number): number {
  if (!(monthlyOpexCents > 0) || !(months > 0)) return 0;
  return Math.round(monthlyOpexCents * Math.round(months * 100) / 100);
}

/** Splits `total` among `needs` in proportion to each need (never more than a need). */
export function fillByNeed(total: number, needs: { id: string; needCents: number }[]): { id: string; cents: number }[] {
  const live = needs.filter((n) => n.needCents > 0);
  const sum = live.reduce((s, n) => s + n.needCents, 0);
  if (total <= 0 || sum === 0) return [];
  if (total >= sum) return live.map((n) => ({ id: n.id, cents: n.needCents }));
  // proportional, largest remainder, then clamp to each need
  const exact = live.map((n) => (total * n.needCents) / sum);
  const out = exact.map(Math.floor);
  let rem = total - out.reduce((s, n) => s + n, 0);
  const order = exact.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of order) { if (rem <= 0) break; if (out[i] < live[i].needCents) { out[i]++; rem--; } }
  return live.map((n, i) => ({ id: n.id, cents: out[i] })).filter((x) => x.cents > 0);
}

export function planAssign(input: AssignInput): AssignPlan {
  const moves: Move[] = [];
  const repayments: AssignPlan["repayments"] = [];
  const totals = { repay: 0, taxes: 0, opex: 0, reservoir1: 0, reservoir2: 0, cash: 0 };
  let left = Math.max(0, Math.floor(input.readyCents));
  const push = (m: Move) => { if (m.cents > 0) moves.push(m); };

  // 1. pay back reserves first
  const bucketId: Record<Bucket, string> = { TAXES: input.taxId, RESERVOIR_1: input.reservoir1.id, RESERVOIR_2: input.reservoir2.id };
  for (const d of input.draws) {
    if (left <= 0) break;
    const pay = Math.min(left, d.outstandingCents);
    if (pay <= 0) continue;
    repayments.push({ drawId: d.id, cents: pay });
    push({ categoryId: bucketId[d.bucket], cents: pay, kind: "REPAY" });
    totals.repay += pay; left -= pay;
  }
  // repayments change the reserve balances the targets below are measured against
  let r1Bal = input.reservoir1.balanceCents, r2Bal = input.reservoir2.balanceCents;
  for (const r of repayments) {
    const d = input.draws.find((x) => x.id === r.drawId)!;
    if (d.bucket === "RESERVOIR_1") r1Bal += r.cents;
    if (d.bucket === "RESERVOIR_2") r2Bal += r.cents;
  }

  // 2. taxes / OPEX split
  const tax = Math.floor((left * Math.min(10000, Math.max(0, input.taxBps))) / 10000);
  let opexMoney = left - tax;
  push({ categoryId: input.taxId, cents: tax, kind: "TAXES" });
  totals.taxes = tax;

  // 3. fill OPEX
  const totalNeed = input.opex.reduce((s, p) => s + Math.max(0, p.needCents), 0);
  for (const f of fillByNeed(opexMoney, input.opex)) { push({ categoryId: f.id, cents: f.cents, kind: "OPEX" }); totals.opex += f.cents; }
  const opexFilled = opexMoney >= totalNeed;
  let overflow = opexMoney - totals.opex;

  // 4. Reservoir 1
  const r1Target = reserveTarget(input.monthlyOpexCents, input.reservoir1.months);
  const r1Take = Math.min(overflow, Math.max(0, r1Target - r1Bal));
  push({ categoryId: input.reservoir1.id, cents: r1Take, kind: "RESERVOIR_1" });
  totals.reservoir1 = r1Take; overflow -= r1Take;
  const reservoir1Filled = r1Bal + r1Take >= r1Target;

  // 5. Reservoir 2 / Cash
  let toCash = 0;
  if (reservoir1Filled && overflow > 0) {
    const share = Math.floor((overflow * Math.min(10000, Math.max(0, input.reservoir2.shareBps))) / 10000);
    const r2Target = reserveTarget(input.monthlyOpexCents, input.reservoir2.months);
    const r2Take = Math.min(share, Math.max(0, r2Target - r2Bal));
    push({ categoryId: input.reservoir2.id, cents: r2Take, kind: "RESERVOIR_2" });
    totals.reservoir2 = r2Take;
    toCash = overflow - r2Take;
    overflow = 0;
  }
  const r2Target = reserveTarget(input.monthlyOpexCents, input.reservoir2.months);
  const reservoir2Filled = r2Bal + totals.reservoir2 >= r2Target;

  // 6. Cash pockets by percentage
  const live = input.cash.filter((c) => c.bps > 0);
  const cashSumBps = Math.min(10000, live.reduce((s, c) => s + c.bps, 0));
  let cashGiven = 0;
  if (toCash > 0 && live.length) {
    const parts = distribute(toCash, live.map((c) => c.bps));
    live.forEach((c, i) => { push({ categoryId: c.id, cents: parts[i], kind: "CASH" }); cashGiven += parts[i]; });
  }
  void cashSumBps;
  totals.cash = cashGiven;

  const leftoverCents = left - tax - totals.opex - totals.reservoir1 - totals.reservoir2 - cashGiven;
  return { moves, repayments, totals, leftoverCents, opexFilled, reservoir1Filled, reservoir2Filled };
}

// ---------------------------------------------------------------------------
// Covering a shortfall
// ---------------------------------------------------------------------------

export interface CoverInput {
  shortfalls: { id: string; name: string; cents: number }[]; // OPEX pockets that are overspent (cents > 0)
  taxId: string; taxBalanceCents: number;
  reservoir1Id: string; reservoir1BalanceCents: number;
  reservoir2Id: string; reservoir2BalanceCents: number;
}
export interface Draw { bucket: Bucket; fromId: string; toId: string; toName: string; cents: number }
export interface CoverPlan { draws: Draw[]; coveredCents: number; uncoveredCents: number }

export function planCover(input: CoverInput): CoverPlan {
  const bal = { TAXES: Math.max(0, input.taxBalanceCents), RESERVOIR_1: Math.max(0, input.reservoir1BalanceCents), RESERVOIR_2: Math.max(0, input.reservoir2BalanceCents) };
  const from: Record<Bucket, string> = { TAXES: input.taxId, RESERVOIR_1: input.reservoir1Id, RESERVOIR_2: input.reservoir2Id };
  const draws: Draw[] = [];
  let covered = 0, uncovered = 0;
  const take = (b: Bucket, want: number, p: { id: string; name: string }) => {
    const c = Math.min(want, bal[b]);
    if (c <= 0) return 0;
    bal[b] -= c; covered += c;
    const existing = draws.find((d) => d.bucket === b && d.toId === p.id);
    if (existing) existing.cents += c; else draws.push({ bucket: b, fromId: from[b], toId: p.id, toName: p.name, cents: c });
    return c;
  };
  for (const p of input.shortfalls) {
    let need = p.cents;
    if (need <= 0) continue;
    // first tier: Taxes and Reservoir 1, half each; if one runs short the other covers the rest
    const half = Math.ceil(need / 2);
    let got = take("TAXES", half, p);
    got += take("RESERVOIR_1", need - got, p);
    if (got < need) got += take("TAXES", need - got, p);
    // second tier
    if (got < need) got += take("RESERVOIR_2", need - got, p);
    uncovered += need - got;
  }
  return { draws, coveredCents: covered, uncoveredCents: uncovered };
}
