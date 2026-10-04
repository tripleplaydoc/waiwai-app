"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { formatCents } from "@/lib/utils/currency";
import { getBudgetSummary } from "@/lib/budget/summary";
import { loadFlow } from "@/lib/budget/waterfall-state";
import { planAssign, planCover, type Bucket } from "@/lib/budget/cashflow-waterfall";
import type { ActionResult } from "./types";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const monthDate = (m: string) => new Date(`${m}-01T00:00:00.000Z`);
const bucketName: Record<Bucket, string> = { TAXES: "Taxes", RESERVOIR_1: "Reservoir 1", RESERVOIR_2: "Reservoir 2" };

async function owns(workspaceId: string) {
  return prisma.workspace.findUnique({ where: { id: workspaceId } });
}

/** Creates (or re-uses) the pockets the waterfall needs and switches it on. Safe to run more than once. */
export async function setupWaterfallAction(workspaceId: string): Promise<ActionResult> {
  await assertAuthed();
  const ws = await owns(workspaceId);
  if (!ws) return { ok: false, error: "Workspace not found." };
  const existing = await prisma.waterfallConfig.findUnique({ where: { workspaceId } });
  const nextOrder = (await prisma.categoryGroup.aggregate({ where: { workspaceId }, _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  let order = nextOrder + 1;

  const findGroup = (name: string) => prisma.categoryGroup.findFirst({ where: { workspaceId, name, isArchived: false } });
  const ensureGroup = async (name: string) => (await findGroup(name)) ?? prisma.categoryGroup.create({ data: { workspaceId, name, sortOrder: order++ } });
  const ensurePocket = async (groupId: string, name: string, data: Record<string, unknown> = {}) =>
    (await prisma.category.findFirst({ where: { workspaceId, categoryGroupId: groupId, name, isArchived: false } })) ??
    prisma.category.create({ data: { workspaceId, categoryGroupId: groupId, name, ...data } });

  // Taxes: reuse the Business tax reserve; otherwise make one
  let taxId = existing?.taxCategoryId ?? null;
  if (!taxId) {
    const profile = await prisma.taxProfile.findUnique({ where: { workspaceId } });
    taxId = profile?.reserveCategoryId ?? (await prisma.category.findFirst({ where: { workspaceId, isSystemManaged: true, type: "SYSTEM", isArchived: false } }))?.id ?? null;
  }
  if (!taxId) {
    const g = await ensureGroup("Taxes");
    taxId = (await ensurePocket(g.id, "Estimated Tax Reserve", { type: "SYSTEM", isSystemManaged: true })).id;
  }

  // OPEX: Business "Operating Expenses"; otherwise a group called "OPEX" the user can fill (or change in settings)
  let opexGroupId = existing?.opexGroupId ?? null;
  if (!opexGroupId) opexGroupId = (await findGroup("Operating Expenses"))?.id ?? (await ensureGroup("OPEX")).id;

  const reserves = await ensureGroup("Reserves");
  const r1 = existing?.reservoir1CategoryId ?? (await ensurePocket(reserves.id, "Reservoir 1")).id;
  const r2 = existing?.reservoir2CategoryId ?? (await ensurePocket(reserves.id, "Reservoir 2")).id;

  const cash = existing?.cashGroupId ? { id: existing.cashGroupId } : await ensureGroup("Cash");
  const haveCash = await prisma.category.count({ where: { workspaceId, categoryGroupId: cash.id, isArchived: false, cashShareBps: { not: null } } });
  if (haveCash === 0) {
    const defaults: [string, number][] = [["Sinking Funds", 4000], ["Future Investments", 3000], ["Distributions", 3000]];
    let i = 0;
    for (const [name, bps] of defaults) {
      const c = await ensurePocket(cash.id, name, { sortOrder: i++ });
      await prisma.category.update({ where: { id: c.id }, data: { cashShareBps: bps } });
    }
  }

  const data = { enabled: true, taxCategoryId: taxId, opexGroupId, reservoir1CategoryId: r1, reservoir2CategoryId: r2, cashGroupId: cash.id };
  if (existing) await prisma.waterfallConfig.update({ where: { workspaceId }, data });
  else await prisma.waterfallConfig.create({ data: { workspaceId, ...data } });
  revalidatePath("/budget");
  return { ok: true, message: "Cashflow waterfall is on." };
}

const settingsSchema = z.object({
  workspaceId: z.string().min(1),
  enabled: z.boolean(),
  taxPct: z.number().min(0).max(100),
  reservoir1Months: z.number().min(0).max(120),
  reservoir2Months: z.number().min(0).max(120),
  reservoir2SharePct: z.number().min(0).max(100),
  opexGroupId: z.string().min(1).nullable(),
  cash: z.array(z.object({ id: z.string().min(1), pct: z.number().min(0).max(100) })),
});

export async function saveWaterfallSettingsAction(input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  await assertAuthed();
  const p = settingsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Check the numbers — percentages are 0–100 and months are 0–120." };
  const d = p.data;
  const cfg = await prisma.waterfallConfig.findUnique({ where: { workspaceId: d.workspaceId } });
  if (!cfg) return { ok: false, error: "Set up the waterfall first." };
  const cashTotal = Math.round(d.cash.reduce((s, c) => s + c.pct, 0) * 100);
  if (cashTotal > 10000) return { ok: false, error: "Cash percentages add up to more than 100%." };
  if (d.opexGroupId) {
    const g = await prisma.categoryGroup.findFirst({ where: { id: d.opexGroupId, workspaceId: d.workspaceId } });
    if (!g) return { ok: false, error: "That OPEX category wasn't found." };
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  await prisma.$transaction([
    prisma.waterfallConfig.update({
      where: { workspaceId: d.workspaceId },
      data: {
        enabled: d.enabled, taxBps: Math.round(d.taxPct * 100), reservoir1Months: round2(d.reservoir1Months), reservoir2Months: round2(d.reservoir2Months),
        reservoir2ShareBps: Math.round(d.reservoir2SharePct * 100), opexGroupId: d.opexGroupId,
      },
    }),
    ...d.cash.map((c) => prisma.category.updateMany({ where: { id: c.id, workspaceId: d.workspaceId }, data: { cashShareBps: Math.round(c.pct * 100) } })),
  ]);
  revalidatePath("/budget");
  return { ok: true, message: "Saved." };
}

/** Adds a pocket to the Cash category so it can take a share of the cash. */
export async function addCashPocketAction(workspaceId: string, name: string): Promise<ActionResult> {
  await assertAuthed();
  const n = name.trim();
  if (!n || n.length > 60) return { ok: false, error: "Give the pocket a short name." };
  const cfg = await prisma.waterfallConfig.findUnique({ where: { workspaceId } });
  if (!cfg?.cashGroupId) return { ok: false, error: "Set up the waterfall first." };
  const dupe = await prisma.category.findFirst({ where: { workspaceId, categoryGroupId: cfg.cashGroupId, name: { equals: n, mode: "insensitive" }, isArchived: false } });
  if (dupe) return { ok: false, error: "There's already a pocket with that name." };
  const count = await prisma.category.count({ where: { workspaceId, categoryGroupId: cfg.cashGroupId } });
  await prisma.category.create({ data: { workspaceId, categoryGroupId: cfg.cashGroupId, name: n, sortOrder: count, cashShareBps: 0 } });
  revalidatePath("/budget");
  return { ok: true };
}

/** The one Assign button: sends Ready to assign down the waterfall. */
export async function assignWaterfallAction(workspaceId: string, month: string): Promise<ActionResult> {
  await assertAuthed();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "Bad request." };
  const md = monthDate(m.data);
  const summary = await getBudgetSummary(workspaceId, md);
  const { vm, cfg, opexInput, outstanding } = await loadFlow(workspaceId, md, summary.rows);
  if (!cfg?.enabled || !vm.tax || !vm.reservoir1 || !vm.reservoir2) return { ok: false, error: "Set up the cashflow waterfall first." };
  if (summary.readyToAssignCents <= 0) return { ok: false, error: "Nothing to assign — Ready to assign is $0.00." };

  const plan = planAssign({
    readyCents: summary.readyToAssignCents, taxBps: vm.taxBps, opex: opexInput, monthlyOpexCents: vm.monthlyOpexCents, taxId: vm.tax.id,
    reservoir1: { id: vm.reservoir1.id, balanceCents: vm.reservoir1.balanceCents, months: vm.reservoir1Months },
    reservoir2: { id: vm.reservoir2.id, balanceCents: vm.reservoir2.balanceCents, months: vm.reservoir2Months, shareBps: vm.reservoir2ShareBps },
    cash: vm.cash.map((c) => ({ id: c.id, bps: c.bps })), draws: outstanding,
  });
  if (plan.moves.length === 0) return { ok: false, error: "Nothing to assign yet — check that your OPEX pockets have monthly costs and the cash percentages add up." };

  const note = { REPAY: "Paid back to reserve", TAXES: "Taxes", OPEX: "OPEX", RESERVOIR_1: "Reservoir 1", RESERVOIR_2: "Reservoir 2", CASH: "Cash" } as const;
  await prisma.$transaction([
    ...plan.moves.map((mv) => prisma.budgetAssignment.create({ data: { categoryId: mv.categoryId, month: md, amountCents: mv.cents, source: "WATERFALL", note: `Waterfall → ${note[mv.kind]}` } })),
    ...plan.repayments.map((r) => prisma.reserveDraw.update({ where: { id: r.drawId }, data: { repaidCents: { increment: r.cents } } })),
  ]);

  const t = plan.totals;
  const parts = [
    t.repay > 0 && `${formatCents(t.repay)} paid back to reserves`, t.taxes > 0 && `${formatCents(t.taxes)} taxes`, t.opex > 0 && `${formatCents(t.opex)} OPEX`,
    t.reservoir1 > 0 && `${formatCents(t.reservoir1)} Reservoir 1`, t.reservoir2 > 0 && `${formatCents(t.reservoir2)} Reservoir 2`, t.cash > 0 && `${formatCents(t.cash)} cash`,
  ].filter(Boolean);
  const left = plan.leftoverCents > 0 ? ` ${formatCents(plan.leftoverCents)} stays in Ready to assign (cash percentages add up to less than 100%).` : "";
  revalidatePath("/budget");
  return { ok: true, message: `Assigned: ${parts.join(" · ")}.${left}` };
}

/** Covers overspent OPEX pockets from Taxes + Reservoir 1 (50/50), then Reservoir 2. The inflow later pays it back first. */
export async function coverShortfallAction(workspaceId: string, month: string): Promise<ActionResult> {
  await assertAuthed();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "Bad request." };
  const md = monthDate(m.data);
  const summary = await getBudgetSummary(workspaceId, md);
  const { vm, cfg } = await loadFlow(workspaceId, md, summary.rows);
  if (!cfg?.enabled || !vm.tax || !vm.reservoir1 || !vm.reservoir2) return { ok: false, error: "Set up the cashflow waterfall first." };
  if (vm.overspent.length === 0) return { ok: false, error: "No OPEX pocket is overspent." };

  const plan = planCover({
    shortfalls: vm.overspent, taxId: vm.tax.id, taxBalanceCents: vm.tax.balanceCents,
    reservoir1Id: vm.reservoir1.id, reservoir1BalanceCents: vm.reservoir1.balanceCents,
    reservoir2Id: vm.reservoir2.id, reservoir2BalanceCents: vm.reservoir2.balanceCents,
  });
  if (plan.draws.length === 0) return { ok: false, error: "Taxes and the reservoirs are empty — nothing to pull from." };

  await prisma.$transaction([
    ...plan.draws.flatMap((d) => [
      prisma.budgetAssignment.create({ data: { categoryId: d.fromId, month: md, amountCents: -d.cents, source: "WATERFALL_COVER", note: `Covered ${d.toName}` } }),
      prisma.budgetAssignment.create({ data: { categoryId: d.toId, month: md, amountCents: d.cents, source: "WATERFALL_COVER", note: `From ${bucketName[d.bucket]}` } }),
      prisma.reserveDraw.create({ data: { workspaceId, bucket: d.bucket, amountCents: d.cents, coveredCategoryId: d.toId, coveredName: d.toName, month: md } }),
    ]),
  ]);
  const by = (b: Bucket) => plan.draws.filter((d) => d.bucket === b).reduce((s, d) => s + d.cents, 0);
  const parts = (["TAXES", "RESERVOIR_1", "RESERVOIR_2"] as const).filter((b) => by(b) > 0).map((b) => `${formatCents(by(b))} from ${bucketName[b]}`);
  const short = plan.uncoveredCents > 0 ? ` ${formatCents(plan.uncoveredCents)} is still uncovered.` : "";
  revalidatePath("/budget");
  return { ok: true, message: `Covered ${formatCents(plan.coveredCents)}: ${parts.join(", ")}. New income will pay this back first.${short}` };
}
