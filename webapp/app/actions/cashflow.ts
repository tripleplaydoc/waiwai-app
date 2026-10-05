"use server";

import { endOfMonth, fundRows, loadPocketBalances, loadPools, moveRows } from "@/lib/budget/funding";
import { loadTaxSplits } from "@/lib/budget/tax-split";
import { expandCoverDraws, expandTaxMoves } from "@/lib/budget/tax-split-math";
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
  if (summary.readyToAssignCents <= 0) return { ok: false, error: "Nothing to assign — the pool is $0.00." };

  const plan = planAssign({
    readyCents: summary.readyToAssignCents, taxBps: vm.taxBps, opex: opexInput, monthlyOpexCents: vm.monthlyOpexCents, taxId: vm.tax.id,
    reservoir1: { id: vm.reservoir1.id, balanceCents: vm.reservoir1.balanceCents, months: vm.reservoir1Months },
    reservoir2: { id: vm.reservoir2.id, balanceCents: vm.reservoir2.balanceCents, months: vm.reservoir2Months, shareBps: vm.reservoir2ShareBps },
    cash: vm.cash.map((c) => ({ id: c.id, bps: c.bps })), draws: outstanding,
  });
  if (plan.moves.length === 0) return { ok: false, error: "Nothing to assign yet — check that your OPEX pockets have monthly costs and the cash percentages add up." };

  const note = { REPAY: "Paid back to reserve", TAXES: "Taxes", OPEX: "OPEX", RESERVOIR_1: "Reservoir 1", RESERVOIR_2: "Reservoir 2", CASH: "Cash" } as const;
  // With a separate tax reserve per account, taxes (and tax paybacks) go to each account's own pocket, in proportion to the cash it holds.
  const taxSplits = await loadTaxSplits(prisma, workspaceId, vm.tax.id);
  const moves = taxSplits.length > 0 ? expandTaxMoves(plan.moves, vm.tax.id, taxSplits, await loadPools(prisma, workspaceId, endOfMonth(md))) : plan.moves;
  const fundRowsAll = await fundRows(prisma, workspaceId, endOfMonth(md), moves.map((mv) => ({ categoryId: mv.categoryId, month: md, amountCents: mv.cents, source: "WATERFALL" as const, note: `Waterfall → ${note[mv.kind]}` })));
  await prisma.$transaction([
    prisma.budgetAssignment.createMany({ data: fundRowsAll }),
    ...plan.repayments.map((r) => prisma.reserveDraw.update({ where: { id: r.drawId }, data: { repaidCents: { increment: r.cents } } })),
  ]);

  const t = plan.totals;
  const parts = [
    t.repay > 0 && `${formatCents(t.repay)} paid back to reserves`, t.taxes > 0 && `${formatCents(t.taxes)} taxes`, t.opex > 0 && `${formatCents(t.opex)} OPEX`,
    t.reservoir1 > 0 && `${formatCents(t.reservoir1)} Reservoir 1`, t.reservoir2 > 0 && `${formatCents(t.reservoir2)} Reservoir 2`, t.cash > 0 && `${formatCents(t.cash)} cash`,
  ].filter(Boolean);
  const left = plan.leftoverCents > 0 ? ` ${formatCents(plan.leftoverCents)} stays in the pool (cash percentages add up to less than 100%).` : "";
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

  const taxSplits = await loadTaxSplits(prisma, workspaceId, vm.tax.id);
  const byId = new Map(summary.rows.map((r) => [r.id, r.availableCents]));
  const coverDraws = taxSplits.length > 0
    ? expandCoverDraws(plan.draws, vm.tax.id, [vm.tax.id, ...taxSplits.map((t) => t.id)].map((id) => ({ id, balanceCents: byId.get(id) ?? 0 })))
    : plan.draws;
  const coverRows = (await Promise.all(coverDraws.map((d) => moveRows(prisma, { workspaceId, fromId: d.fromId, toId: d.toId, month: md, cents: d.cents, source: "WATERFALL_COVER", noteFrom: `Covered ${d.toName}`, noteTo: `From ${bucketName[d.bucket]}` })))).flat();
  await prisma.$transaction([
    prisma.budgetAssignment.createMany({ data: coverRows }),
    ...plan.draws.flatMap((d) => [
      prisma.reserveDraw.create({ data: { workspaceId, bucket: d.bucket, amountCents: d.cents, coveredCategoryId: d.toId, coveredName: d.toName, month: md } }),
    ]),
  ]);
  const by = (b: Bucket) => plan.draws.filter((d) => d.bucket === b).reduce((s, d) => s + d.cents, 0);
  const parts = (["TAXES", "RESERVOIR_1", "RESERVOIR_2"] as const).filter((b) => by(b) > 0).map((b) => `${formatCents(by(b))} from ${bucketName[b]}`);
  const short = plan.uncoveredCents > 0 ? ` ${formatCents(plan.uncoveredCents)} is still uncovered.` : "";
  revalidatePath("/budget");
  return { ok: true, message: `Covered ${formatCents(plan.coveredCents)}: ${parts.join(", ")}. New income will pay this back first.${short}` };
}

/** Sets Months ahead on every monthly-cost pocket in the OPEX category at once (0 = this month only). */
export async function setOpexMonthsAheadAction(workspaceId: string, months: number): Promise<ActionResult> {
  await assertAuthed();
  if (!Number.isInteger(months) || months < 0 || months > 6) return { ok: false, error: "Pick 0 to 6 months." };
  const cfg = await prisma.waterfallConfig.findUnique({ where: { workspaceId } });
  if (!cfg?.opexGroupId) return { ok: false, error: "Choose your OPEX category in the waterfall settings first." };
  const r = await prisma.category.updateMany({
    where: { workspaceId, categoryGroupId: cfg.opexGroupId, type: "EXPENSE", isArchived: false, isSystemManaged: false, fundingTargetType: "MONTHLY_FUNDING" },
    data: { monthsAhead: months },
  });
  if (r.count === 0) return { ok: false, error: "No OPEX pockets have a monthly cost yet." };
  revalidatePath("/budget");
  return { ok: true, message: `${r.count} monthly cost${r.count === 1 ? "" : "s"} now ${months === 0 ? "cover this month only" : `keep ${months} month${months === 1 ? "" : "s"} ahead`}.` };
}

/** Gives each cash account its own tax reserve pocket, and moves the existing reserve across by the account each dollar sits in. */
export async function splitTaxReserveAction(workspaceId: string, month: string): Promise<ActionResult> {
  await assertAuthed();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "Bad request." };
  const md = monthDate(m.data);
  const cfg = await prisma.waterfallConfig.findUnique({ where: { workspaceId } });
  if (!cfg?.taxCategoryId) return { ok: false, error: "Set up the cashflow waterfall first." };
  const main = await prisma.category.findFirst({ where: { id: cfg.taxCategoryId, workspaceId, isArchived: false } });
  if (!main) return { ok: false, error: "The tax reserve pocket was not found." };
  const accounts = await prisma.account.findMany({
    where: { workspaceId, onBudget: true, isArchived: false, balanceMode: "TRANSACTION_DERIVED", type: { in: ["CHECKING", "SAVINGS", "CASH"] } },
    orderBy: { name: "asc" }, select: { id: true, name: true },
  });
  if (accounts.length < 2) return { ok: false, error: "You need at least two cash accounts to split the reserve." };
  const existing = await loadTaxSplits(prisma, workspaceId, main.id);
  const have = new Set(existing.map((e) => e.accountId));
  const todo = accounts.filter((a) => !have.has(a.id));
  if (todo.length === 0) return { ok: false, error: "Every account already has its own tax reserve." };

  const top = await prisma.category.aggregate({ where: { workspaceId, categoryGroupId: main.categoryGroupId }, _max: { sortOrder: true } });
  let order = (top._max.sortOrder ?? 0) + 1;
  const made = new Map<string, string>();
  for (const a of todo) {
    const c = await prisma.category.create({ data: { workspaceId, categoryGroupId: main.categoryGroupId, name: `Tax Reserve: ${a.name}`, type: "SYSTEM", isSystemManaged: true, paidFromAccountId: a.id, sortOrder: order++ } });
    made.set(a.id, c.id);
  }
  // Move what the main reserve already holds into the matching account's pocket (money not tied to an account stays put).
  const parts = (await loadPocketBalances(prisma, workspaceId, [main.id], md)).get(main.id) ?? [];
  const rows = parts.flatMap(([k, n]) => {
    const to = k ? made.get(k) : undefined;
    if (!to || n <= 0) return [];
    return [
      { categoryId: main.id, month: md, amountCents: -n, source: "MANUAL" as const, note: "Moved to the account's own tax reserve", fundingAccountId: k },
      { categoryId: to, month: md, amountCents: n, source: "MANUAL" as const, note: "Moved from the shared tax reserve", fundingAccountId: k },
    ];
  });
  if (rows.length > 0) await prisma.budgetAssignment.createMany({ data: rows });
  revalidatePath("/budget"); revalidatePath("/reports");
  return { ok: true, message: `Each account now has its own tax reserve (${todo.map((a) => a.name).join(", ")}). Assign fills them by the cash each account holds.` };
}

/** Puts the per-account tax reserves back into the one shared reserve and retires the extra pockets. */
export async function combineTaxReserveAction(workspaceId: string, month: string): Promise<ActionResult> {
  await assertAuthed();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "Bad request." };
  const md = monthDate(m.data);
  const cfg = await prisma.waterfallConfig.findUnique({ where: { workspaceId } });
  if (!cfg?.taxCategoryId) return { ok: false, error: "Set up the cashflow waterfall first." };
  const splits = await loadTaxSplits(prisma, workspaceId, cfg.taxCategoryId);
  if (splits.length === 0) return { ok: false, error: "The tax reserve is not split." };
  const summary = await getBudgetSummary(workspaceId, md);
  const bal = new Map(summary.rows.map((r) => [r.id, r.availableCents]));
  const over = splits.filter((s) => (bal.get(s.id) ?? 0) < 0);
  if (over.length > 0) return { ok: false, error: `${over.map((o) => o.name).join(", ")} is overspent. Cover it first, then combine.` };
  const balances = await loadPocketBalances(prisma, workspaceId, splits.map((s) => s.id), md);
  const rows = splits.flatMap((s) => (balances.get(s.id) ?? []).flatMap(([k, n]) => n > 0 ? [
    { categoryId: s.id, month: md, amountCents: -n, source: "MANUAL" as const, note: "Moved back to the shared tax reserve", fundingAccountId: k },
    { categoryId: cfg.taxCategoryId!, month: md, amountCents: n, source: "MANUAL" as const, note: `From ${s.name}`, fundingAccountId: k },
  ] : []));
  await prisma.$transaction([
    ...(rows.length > 0 ? [prisma.budgetAssignment.createMany({ data: rows })] : []),
    prisma.category.updateMany({ where: { id: { in: splits.map((s) => s.id) }, workspaceId }, data: { isArchived: true } }),
  ]);
  revalidatePath("/budget"); revalidatePath("/reports");
  return { ok: true, message: "Back to one shared tax reserve." };
}
