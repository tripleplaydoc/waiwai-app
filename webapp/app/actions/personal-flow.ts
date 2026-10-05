"use server";

import { endOfMonth, fundRows } from "@/lib/budget/funding";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { formatCents } from "@/lib/utils/currency";
import { getBudgetSummary } from "@/lib/budget/summary";
import { loadPersonalFlow } from "@/lib/budget/personal-flow-state";
import { planPersonalAssign } from "@/lib/budget/personal-flow";
import type { ActionResult } from "./types";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const monthDate = (m: string) => new Date(`${m}-01T00:00:00.000Z`);

async function personalWorkspace(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  return ws && ws.type === "PERSONAL" ? ws : null;
}

/** Creates (or re-uses) the Give / Save / Live categories and switches the personal flow on. Safe to run again. */
export async function setupPersonalFlowAction(workspaceId: string): Promise<ActionResult> {
  await assertAuthed();
  if (!(await personalWorkspace(workspaceId))) return { ok: false, error: "The Give / Save / Live flow is for the Personal workspace." };
  const existing = await prisma.personalFlowConfig.findUnique({ where: { workspaceId } });
  let order = ((await prisma.categoryGroup.aggregate({ where: { workspaceId }, _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;

  const groups = await prisma.categoryGroup.findMany({ where: { workspaceId, isArchived: false } });
  const named = (...names: string[]) => groups.filter((g) => names.some((n) => g.name.toLowerCase() === n));
  const make = async (name: string, pocketName: string) => {
    const g = await prisma.categoryGroup.create({ data: { workspaceId, name, sortOrder: order++ } });
    await prisma.category.create({ data: { workspaceId, categoryGroupId: g.id, name: pocketName, flowShareBps: 10000 } });
    return [g.id];
  };
  // Keep what's already set; otherwise pick categories you already have by name, and make the rest.
  const give = existing?.giveGroupIds.length ? existing.giveGroupIds : named("give", "giving").map((g) => g.id);
  const save = existing?.saveGroupIds.length ? existing.saveGroupIds : named("save", "savings").map((g) => g.id);
  const live = existing?.liveGroupIds.length ? existing.liveGroupIds : named("live", "bills", "everyday").map((g) => g.id);
  const data = {
    enabled: true,
    giveGroupIds: give.length ? give : await make("Give", "Giving"),
    saveGroupIds: save.length ? save : await make("Save", "Savings"),
    liveGroupIds: live.length ? live : await make("Live", "Everyday Spending"),
  };
  if (existing) await prisma.personalFlowConfig.update({ where: { workspaceId }, data });
  else await prisma.personalFlowConfig.create({ data: { workspaceId, ...data } });
  revalidatePath("/budget");
  return { ok: true, message: "Give / Save / Live is on." };
}

const settingsSchema = z.object({
  workspaceId: z.string().min(1),
  givePct: z.number().min(0).max(100),
  savePct: z.number().min(0).max(100),
  livePct: z.number().min(0).max(100),
  giveGroupIds: z.array(z.string().min(1)),
  saveGroupIds: z.array(z.string().min(1)),
  liveGroupIds: z.array(z.string().min(1)),
  shares: z.array(z.object({ id: z.string().min(1), pct: z.number().min(0).max(100) })),
});

export async function savePersonalFlowSettingsAction(input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  await assertAuthed();
  const p = settingsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Check the numbers — percentages are 0–100." };
  const d = p.data;
  if (!(await personalWorkspace(d.workspaceId))) return { ok: false, error: "The Give / Save / Live flow is for the Personal workspace." };
  const cfg = await prisma.personalFlowConfig.findUnique({ where: { workspaceId: d.workspaceId } });
  if (!cfg) return { ok: false, error: "Set up Give / Save / Live first." };

  const give = Math.round(d.givePct * 100), save = Math.round(d.savePct * 100), live = Math.round(d.livePct * 100);
  if (give + save + live !== 10000) return { ok: false, error: `Give, Save and Live add up to ${(give + save + live) / 100}% — they need to add up to 100%.` };
  const gids = [...d.giveGroupIds, ...d.saveGroupIds, ...d.liveGroupIds];
  if (new Set(gids).size !== gids.length) return { ok: false, error: "A category can only be in one of Give, Save or Live." };
  if (gids.length) {
    const found = await prisma.categoryGroup.count({ where: { id: { in: gids }, workspaceId: d.workspaceId } });
    if (found !== gids.length) return { ok: false, error: "One of those categories wasn't found." };
  }
  await prisma.$transaction([
    prisma.personalFlowConfig.update({ where: { workspaceId: d.workspaceId }, data: { giveBps: give, saveBps: save, liveBps: live, giveGroupIds: d.giveGroupIds, saveGroupIds: d.saveGroupIds, liveGroupIds: d.liveGroupIds } }),
    ...d.shares.map((s) => prisma.category.updateMany({ where: { id: s.id, workspaceId: d.workspaceId }, data: { flowShareBps: Math.round(s.pct * 100) } })),
  ]);
  revalidatePath("/budget");
  return { ok: true, message: "Saved." };
}

/** The one Assign button on the Personal side: Ready to assign → Give / Save / Live. */
export async function assignPersonalFlowAction(workspaceId: string, month: string): Promise<ActionResult> {
  await assertAuthed();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "Bad request." };
  if (!(await personalWorkspace(workspaceId))) return { ok: false, error: "The Give / Save / Live flow is for the Personal workspace." };
  const md = monthDate(m.data);
  const summary = await getBudgetSummary(workspaceId, md);
  const { vm, cfg, input } = await loadPersonalFlow(workspaceId, md, summary.rows);
  if (!cfg?.enabled) return { ok: false, error: "Set up Give / Save / Live first." };
  if (summary.readyToAssignCents <= 0) return { ok: false, error: "Nothing to assign — the pool is $0.00." };

  const plan = planPersonalAssign({
    readyCents: summary.readyToAssignCents,
    splits: { GIVE: cfg.giveBps, SAVE: cfg.saveBps, LIVE: cfg.liveBps },
    buckets: input,
  });
  if (plan.moves.length === 0) return { ok: false, error: "Nothing to assign yet — each of Give, Save and Live needs at least one pocket." };

  const label = { GIVE: "Give", SAVE: "Save", LIVE: "Live" } as const;
  const flowRows = await fundRows(prisma, workspaceId, endOfMonth(md), plan.moves.map((mv) => ({ categoryId: mv.categoryId, month: md, amountCents: mv.cents, source: "WATERFALL" as const, note: `Flow → ${label[mv.bucket]}` })));
  await prisma.budgetAssignment.createMany({ data: flowRows });
  const parts = vm.buckets.filter((b) => plan.totals[b.key] > 0).map((b) => `${formatCents(plan.totals[b.key])} ${b.label}`);
  const left = plan.leftoverCents > 0 ? ` ${formatCents(plan.leftoverCents)} stays in the pool (a bucket has no pockets yet).` : "";
  revalidatePath("/budget");
  return { ok: true, message: `Assigned: ${parts.join(" · ")}.${left}` };
}
