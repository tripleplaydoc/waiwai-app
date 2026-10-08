import "server-only";
import { prisma } from "@/lib/prisma";
import { isoToDate } from "@/lib/utils/dates";
import { buildStewardship, type FlowMapping, type OutflowEntry, type Stewardship } from "@/lib/stewardship";

const KEPT_TYPES = new Set(["SAVINGS", "INVESTMENT", "OTHER_ASSET", "PROPERTY"]);
const SPENDING_TYPES = new Set(["CHECKING", "CASH"]);
const looksLikeSavings = (name: string) => /\bsav/i.test(name);

/**
 * This month's money out (1st through today), grouped Give / Save / Live.
 *   - Spending is read from transactions (split rows win over the transaction's own pocket).
 *   - A transfer from a spending account into a savings, investment or asset account counts as Save (money kept).
 *   - Other transfers between your own accounts, and card or loan payments, are left out: the spending itself is already counted.
 */
export async function loadStewardship(workspaceId: string, today: string): Promise<Stewardship> {
  const monthStart = isoToDate(`${today.slice(0, 7)}-01`);
  const [cfg, groups, cats, accounts, txs] = await Promise.all([
    prisma.personalFlowConfig.findUnique({ where: { workspaceId } }),
    prisma.categoryGroup.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { workspaceId }, select: { id: true, name: true, type: true, categoryGroupId: true, assetAccountId: true, legacy: true } }),
    prisma.account.findMany({ where: { workspaceId }, select: { id: true, name: true, type: true, onBudget: true } }),
    prisma.transaction.findMany({
      where: { workspaceId, date: { gte: monthStart, lte: isoToDate(today) }, account: { onBudget: true } },
      select: { amountCents: true, categoryId: true, accountId: true, transferAccountId: true, transferGroupId: true, splits: { select: { categoryId: true, amountCents: true } } },
    }),
  ]);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const cat = new Map(cats.map((c) => [c.id, c]));
  const acct = new Map(accounts.map((a) => [a.id, a]));

  const map: FlowMapping | null = cfg?.enabled ? { give: cfg.giveGroupIds, save: cfg.saveGroupIds, live: cfg.liveGroupIds, reserve: cfg.reserveGroupIds } : null;

  const entries: OutflowEntry[] = [];
  const addCategory = (categoryId: string | null, amountCents: number) => {
    const c = categoryId ? cat.get(categoryId) : undefined;
    if (!c) { if (amountCents < 0) entries.push({ cents: -amountCents, label: "Not sorted yet", groupId: null, groupName: null }); return; }
    if (c.type === "INCOME") return;
    entries.push({
      cents: -amountCents, label: c.name, keeps: !!c.assetAccountId || c.legacy,
      groupId: c.categoryGroupId, groupName: c.categoryGroupId ? groupName.get(c.categoryGroupId) ?? null : null,
    });
  };

  for (const t of txs) {
    if (t.transferAccountId || t.transferGroupId) {
      const from = acct.get(t.accountId), to = t.transferAccountId ? acct.get(t.transferAccountId) : undefined;
      if (t.amountCents < 0 && from && to && SPENDING_TYPES.has(from.type) && !looksLikeSavings(from.name) && (KEPT_TYPES.has(to.type) || looksLikeSavings(to.name))) {
        entries.push({ cents: -t.amountCents, label: `Moved to ${to.name}`, kept: true, groupId: null, groupName: null });
      }
      continue;
    }
    if (t.splits.length > 0) { for (const s of t.splits) addCategory(s.categoryId, s.amountCents); continue; }
    addCategory(t.categoryId, t.amountCents);
  }
  return buildStewardship(entries, map);
}
