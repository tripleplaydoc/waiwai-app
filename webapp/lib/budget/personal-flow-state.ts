import "server-only";
import { prisma } from "@/lib/prisma";
import { opexPocket } from "./waterfall-state";
import type { EnvelopeRow } from "./summary";
import type { PersonalAssignInput, PersonalBucket } from "./personal-flow";
import type { PersonalBucketVM, PersonalFlowVM } from "./personal-flow-types";

export const BUCKET_LABEL: Record<PersonalBucket, string> = { GIVE: "Give", SAVE: "Save", LIVE: "Live" };

export async function loadPersonalFlow(workspaceId: string, month: Date, rows: EnvelopeRow[]) {
  const [cfg, groups, cats] = await Promise.all([
    prisma.personalFlowConfig.findUnique({ where: { workspaceId } }),
    prisma.categoryGroup.findMany({ where: { workspaceId, isArchived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.category.findMany({ where: { workspaceId, isArchived: false }, select: { id: true, flowShareBps: true, sortOrder: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const share = new Map(cats.map((c) => [c.id, c.flowShareBps ?? 0]));
  const order = new Map(cats.map((c, i) => [c.id, i]));
  const groupIds: Record<PersonalBucket, string[]> = { GIVE: cfg?.giveGroupIds ?? [], SAVE: cfg?.saveGroupIds ?? [], LIVE: cfg?.liveGroupIds ?? [] };
  const bps: Record<PersonalBucket, number> = { GIVE: cfg?.giveBps ?? 2000, SAVE: cfg?.saveBps ?? 1000, LIVE: cfg?.liveBps ?? 7000 };

  const input: PersonalAssignInput["buckets"] = { GIVE: [], SAVE: [], LIVE: [] };
  const buckets: PersonalBucketVM[] = (["GIVE", "SAVE", "LIVE"] as const).map((key) => {
    const gids = groupIds[key];
    const gpos = (id: string | null) => gids.indexOf(id ?? "");
    const pockets = rows
      .filter((r) => gids.includes(r.groupId ?? "") && r.type === "EXPENSE")
      .sort((a, b) => gpos(a.groupId) - gpos(b.groupId) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const vmPockets = pockets.map((r) => {
      const need = Math.max(opexPocket(r, month).need, -r.availableCents, 0);
      input[key].push({ id: r.id, needCents: need, shareBps: share.get(r.id) ?? 0 });
      return { id: r.id, name: r.name, balanceCents: r.availableCents, needCents: need, shareBps: share.get(r.id) ?? 0 };
    });
    return {
      key, label: BUCKET_LABEL[key], bps: bps[key], groupIds: gids, groupNames: gids.map((id) => groups.find((g) => g.id === id)?.name).filter((n): n is string => !!n),
      balanceCents: vmPockets.reduce((s, p) => s + Math.max(0, p.balanceCents), 0),
      needCents: vmPockets.reduce((s, p) => s + p.needCents, 0),
      pockets: vmPockets,
    };
  });
  // income-only categories can't receive assigned money, so they're not offered as a destination
  const incomeOnly = new Set(groups.filter((g) => { const r = rows.filter((x) => x.groupId === g.id); return r.length > 0 && r.every((x) => x.type === "INCOME"); }).map((g) => g.id));
  const vm: PersonalFlowVM = { enabled: !!cfg?.enabled, buckets, groups: groups.filter((g) => !incomeOnly.has(g.id)) };
  return { vm, cfg, input };
}
