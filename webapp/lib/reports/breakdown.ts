import "server-only";
import { prisma } from "@/lib/prisma";
import { effectiveType, typeLabel } from "@/lib/budget/expense-types";
import { activity } from "./pnl";
import { EXPENSE_TAGS, TAG_DEFS, type ExpenseTagKey } from "@/lib/budget/expense-tags";

export interface Slice { key: string; label: string; cents: number; children?: { label: string; cents: number }[] }
export interface Breakdown {
  totalCents: number;
  byCategory: Slice[];   // UI "category" = category group, pockets inside
  byType: Slice[];
  byTag: Slice[];        // an expense with several tags counts under each; "Untagged" is what's left
  taggedUniqueCents: number;
}

const sortDesc = (a: Slice[]) => a.filter((s) => s.cents > 0).sort((x, y) => y.cents - x.cents);

/** Where the money went in a window: by category (with pockets), by type, and by tag. Refunds net against spending. */
export async function expenseBreakdown(workspaceId: string, from: string, to: string): Promise<Breakdown> {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const [act, cats, groups, tagged] = await Promise.all([
    activity(workspaceId, from, to),
    prisma.category.findMany({ where: { workspaceId, type: "EXPENSE" } }),
    prisma.categoryGroup.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
    prisma.transaction.findMany({
      where: { workspaceId, date: { gte: d(from), lte: d(to) }, amountCents: { lt: 0 }, transferGroupId: null, tags: { isEmpty: false }, category: { type: "EXPENSE" } },
      select: { amountCents: true, tags: true },
    }),
  ]);
  const gName = new Map(groups.map((g) => [g.id, g.name]));
  const byGroup = new Map<string, Slice>(), byType = new Map<string, Slice>();
  let total = 0;
  for (const c of cats) {
    const cents = -(act.byCategory.get(c.id) ?? 0);
    if (cents === 0) continue;
    total += cents;
    const gk = c.categoryGroupId ?? "none";
    const g = byGroup.get(gk) ?? { key: gk, label: c.categoryGroupId ? gName.get(c.categoryGroupId) ?? "Other" : "Other", cents: 0, children: [] };
    g.cents += cents; g.children!.push({ label: c.name, cents });
    byGroup.set(gk, g);
    const tk = effectiveType(c) ?? "UNCLASSIFIED";
    const t = byType.get(tk) ?? { key: tk, label: typeLabel(tk) ?? "Unclassified", cents: 0 };
    t.cents += cents; byType.set(tk, t);
  }
  const tagSums = new Map<ExpenseTagKey, number>();
  let taggedUnique = 0;
  for (const t of tagged) {
    taggedUnique += -t.amountCents;
    for (const k of t.tags as ExpenseTagKey[]) tagSums.set(k, (tagSums.get(k) ?? 0) + -t.amountCents);
  }
  const byTag: Slice[] = EXPENSE_TAGS.map((k) => ({ key: k, label: TAG_DEFS[k].label, cents: tagSums.get(k) ?? 0 }));
  const untagged = Math.max(0, total - taggedUnique);
  if (untagged > 0) byTag.push({ key: "UNTAGGED", label: "Untagged", cents: untagged });
  for (const g of byGroup.values()) g.children = g.children!.filter((c) => c.cents > 0).sort((a, b) => b.cents - a.cents);
  return { totalCents: total, byCategory: sortDesc([...byGroup.values()]), byType: sortDesc([...byType.values()]), byTag: byTag.filter((s) => s.cents > 0), taggedUniqueCents: taggedUnique };
}
