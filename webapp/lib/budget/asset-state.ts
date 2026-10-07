import "server-only";
import { prisma } from "@/lib/prisma";
import { dateToIso } from "@/lib/utils/dates";
import { holdingOf, holdingSide } from "@/lib/holdings";
import type { AssetOption, AssetVM } from "./board-types";

/**
 * Pockets that feed an asset, with each asset's own current value (its latest valuation) and the goal for it.
 * Never blocks the budget: if anything here goes wrong the pockets simply show without the asset bar.
 */
export async function loadAssetPockets(workspaceId: string): Promise<{ byPocket: Map<string, AssetVM>; options: AssetOption[] }> {
  const byPocket = new Map<string, AssetVM>();
  try {
    const [pockets, accounts] = await Promise.all([
      prisma.category.findMany({ where: { workspaceId, isArchived: false, assetAccountId: { not: null } }, select: { id: true, assetAccountId: true, assetGoalCents: true } }),
      prisma.account.findMany({
        where: { workspaceId, isArchived: false, balanceMode: "MANUAL" },
        include: { manualBalanceEntries: { orderBy: { asOfDate: "desc" }, take: 1 } },
        orderBy: { name: "asc" },
      }),
    ]);
    const assets = accounts.filter((a) => holdingSide(holdingOf(a)) === "ASSET");
    const takenBy = new Map(pockets.map((p) => [p.assetAccountId!, p.id]));
    for (const p of pockets) {
      const a = assets.find((x) => x.id === p.assetAccountId);
      if (!a) continue;
      const v = a.manualBalanceEntries[0];
      byPocket.set(p.id, { accountId: a.id, name: a.name, valueCents: Math.max(0, v?.balanceCents ?? 0), goalCents: p.assetGoalCents, asOfIso: v ? dateToIso(v.asOfDate) : null });
    }
    return { byPocket, options: assets.map((a) => ({ id: a.id, name: a.name, takenBy: takenBy.get(a.id) ?? null })) };
  } catch {
    return { byPocket, options: [] };
  }
}
