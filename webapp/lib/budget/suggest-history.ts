import "server-only";
import { prisma } from "@/lib/prisma";
import type { HistoryHit } from "./suggest";

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * For each text (a payee as typed or imported), which pockets this workspace's past spending with that payee went to.
 * A payee matches when its name equals the text, or one contains the other (names of 3+ letters).
 */
export async function historyForTexts(workspaceId: string, texts: string[]): Promise<Map<string, HistoryHit[]>> {
  const out = new Map<string, HistoryHit[]>();
  const wanted = [...new Set(texts.map((t) => t.trim()).filter((t) => clean(t).length >= 2))];
  if (wanted.length === 0) return out;
  const payees = await prisma.payee.findMany({ where: { workspaceId, isArchived: false }, select: { id: true, name: true, defaultCategoryId: true }, take: 3000 });
  const matches = new Map<string, typeof payees>();
  for (const t of wanted) {
    const q = clean(t);
    matches.set(t, payees.filter((p) => { const n = clean(p.name); return n.length >= 3 ? n === q || q.includes(n) || n.includes(q) : n === q; }));
  }
  const ids = [...new Set([...matches.values()].flat().map((p) => p.id))];
  const rows = ids.length === 0 ? [] : await prisma.transaction.groupBy({
    by: ["payeeId", "categoryId"],
    where: { workspaceId, payeeId: { in: ids }, categoryId: { not: null }, amountCents: { lt: 0 } },
    _count: { _all: true },
  });
  const byPayee = new Map<string, { categoryId: string; count: number }[]>();
  for (const r of rows) if (r.payeeId && r.categoryId) byPayee.set(r.payeeId, [...(byPayee.get(r.payeeId) ?? []), { categoryId: r.categoryId, count: r._count._all }]);
  for (const t of wanted) {
    const q = clean(t);
    const hits: HistoryHit[] = [];
    for (const p of matches.get(t) ?? []) {
      const exact = clean(p.name) === q;
      for (const r of byPayee.get(p.id) ?? []) hits.push({ categoryId: r.categoryId, count: r.count, exact, payee: p.name });
      if (p.defaultCategoryId && !hits.some((h) => h.categoryId === p.defaultCategoryId && h.payee === p.name)) hits.push({ categoryId: p.defaultCategoryId, count: 1, exact, payee: p.name });
    }
    out.set(t, hits);
  }
  return out;
}
