import "server-only";
import { prisma } from "@/lib/prisma";
import { pocketProgress } from "./targets";
import { reserveTarget, type AssignInput, type OutstandingDraw } from "./cashflow-waterfall";
import type { EnvelopeRow } from "./summary";
import type { FlowVM } from "./flow-types";

const D = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);

/** What an OPEX pocket still needs, and what it costs per month. */
export function opexPocket(r: EnvelopeRow, month: Date) {
  const p = pocketProgress(
    { assignedCents: r.assignedCents, activityCents: r.activityCents, availableCents: r.availableCents, targetType: r.targetType, targetCents: r.targetCents, targetDate: D(r.targetDate), manualPaid: r.manualPaid, monthsAhead: r.monthsAhead },
    month
  );
  let need = 0;
  if (p.targetType === "MONTHLY_FUNDING") {
    const spent = Math.max(0, -r.activityCents);
    const paid = r.manualPaid || (spent > 0 && spent >= p.targetCents); // paid this month = nothing more to fund
    need = r.monthsAhead > 0 ? p.stillNeededCents : paid ? 0 : Math.max(0, p.targetCents - r.availableCents);
  }
  else if (p.targetType === "TARGET_BALANCE") need = Math.max(0, p.targetCents - r.availableCents);
  else if (p.targetType === "TARGET_BALANCE_BY_DATE") need = p.stillNeededCents;
  // an overspent pocket first has to climb back to zero
  const monthly = p.targetType === "MONTHLY_FUNDING" ? p.targetCents : 0;
  return { need, monthly };
}

export async function loadFlow(workspaceId: string, month: Date, rows: EnvelopeRow[]) {
  const [cfg, draws, groups] = await Promise.all([
    prisma.waterfallConfig.findUnique({ where: { workspaceId } }),
    prisma.reserveDraw.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.categoryGroup.findMany({ where: { workspaceId, isArchived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cats = cfg ? await prisma.category.findMany({ where: { workspaceId, isArchived: false, cashShareBps: { not: null } }, select: { id: true, name: true, cashShareBps: true, categoryGroupId: true, sortOrder: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) : [];
  const pocket = (id: string | null | undefined) => { const r = id ? byId.get(id) : undefined; return r ? { id: r.id, name: r.name, balanceCents: r.availableCents } : null; };

  const opexRows = cfg?.opexGroupId ? rows.filter((r) => r.groupId === cfg.opexGroupId && r.type === "EXPENSE") : [];
  let monthly = 0, need = 0, balance = 0;
  const overspent: FlowVM["overspent"] = [];
  const opexInput: AssignInput["opex"] = [];
  for (const r of opexRows) {
    const o = opexPocket(r, month);
    monthly += o.monthly; need += o.need; balance += Math.max(0, r.availableCents);
    opexInput.push({ id: r.id, needCents: Math.max(o.need, -r.availableCents, 0) });
    if (r.availableCents < 0) overspent.push({ id: r.id, name: r.name, cents: -r.availableCents });
  }

  const r1m = Number(cfg?.reservoir1Months ?? 3), r2m = Number(cfg?.reservoir2Months ?? 3);
  const r1 = pocket(cfg?.reservoir1CategoryId), r2 = pocket(cfg?.reservoir2CategoryId);
  const cash = cats.filter((c) => byId.has(c.id) && (!cfg?.cashGroupId || c.categoryGroupId === cfg.cashGroupId)).map((c) => ({ id: c.id, name: c.name, balanceCents: byId.get(c.id)!.availableCents, bps: c.cashShareBps ?? 0 }));

  const outstanding: OutstandingDraw[] = draws.filter((d) => d.amountCents > d.repaidCents).map((d) => ({ id: d.id, bucket: d.bucket, outstandingCents: d.amountCents - d.repaidCents }));
  const owedBy = (b: OutstandingDraw["bucket"]) => outstanding.filter((d) => d.bucket === b).reduce((s, d) => s + d.outstandingCents, 0);
  const owed = (["TAXES", "RESERVOIR_1", "RESERVOIR_2"] as const).map((bucket) => ({ bucket, cents: owedBy(bucket) })).filter((o) => o.cents > 0);

  const vm: FlowVM = {
    enabled: !!cfg?.enabled,
    taxBps: cfg?.taxBps ?? 3000,
    reservoir1Months: r1m, reservoir2Months: r2m,
    reservoir2ShareBps: cfg?.reservoir2ShareBps ?? 5000,
    tax: pocket(cfg?.taxCategoryId),
    opexGroupId: cfg?.opexGroupId ?? null,
    opexGroupName: groups.find((g) => g.id === cfg?.opexGroupId)?.name ?? null,
    monthlyOpexCents: monthly, opexBalanceCents: balance, opexNeedCents: need,
    opexMonthlyCount: opexRows.filter((r) => r.targetType === "MONTHLY_FUNDING").length,
    opexMonthsAhead: (() => { const s = new Set(opexRows.filter((r) => r.targetType === "MONTHLY_FUNDING").map((r) => r.monthsAhead)); return s.size === 1 ? [...s][0] : null; })(),
    reservoir1: r1 ? { ...r1, targetCents: reserveTarget(monthly, r1m) } : null,
    reservoir2: r2 ? { ...r2, targetCents: reserveTarget(monthly, r2m) } : null,
    cash, cashBalanceCents: cash.reduce((s, c) => s + Math.max(0, c.balanceCents), 0), cashPctBps: cash.reduce((s, c) => s + c.bps, 0),
    owed, owedCents: owed.reduce((s, o) => s + o.cents, 0),
    overspent,
    groups,
  };
  return { vm, cfg, opexInput, outstanding };
}
