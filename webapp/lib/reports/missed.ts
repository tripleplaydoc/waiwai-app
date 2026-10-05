import "server-only";
import { prisma } from "@/lib/prisma";
import { TYPE_DEFS, OWNER_DRAW, UNACCOUNTED, deductibleShareBps, effectiveType, typeLabel } from "@/lib/budget/expense-types";
import { matchRule } from "@/lib/budget/suggest";

export interface MissedItem {
  key: string;
  kind: "uncategorized" | "wrong-pocket" | "unflagged-pocket";
  title: string;
  detail: string;
  amountCents: number;
  count: number;
  /** Estimated tax saved if all of it is deductible (meals at 50%). */
  savingCents: number;
  /** Pockets to flag deductible in one tap (unflagged-pocket only). */
  pocketId?: string;
}

const BUSINESS = new Set(TYPE_DEFS.filter((t) => t.group === "Business").map((t) => t.key));
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

/**
 * Money that left the business in the period and may be a deduction you have not claimed:
 * outflows nobody categorized, outflows in pockets not flagged deductible that look like business costs,
 * and business-type pockets that are not flagged. Guidance only.
 */
export async function missedDeductions(workspaceId: string, from: string, to: string, taxBps: number): Promise<MissedItem[]> {
  const [txs, cats] = await Promise.all([
    prisma.transaction.findMany({
      where: { workspaceId, date: { gte: d(from), lte: d(to) }, amountCents: { lt: 0 }, transferGroupId: null, splits: { none: {} } },
      select: { amountCents: true, memo: true, categoryId: true, isTaxDeductible: true, payee: { select: { name: true } }, account: { select: { id: true } } },
      take: 4000,
    }),
    prisma.category.findMany({ where: { workspaceId, isArchived: false } }),
  ]);
  const cat = new Map(cats.map((c) => [c.id, c]));
  const save = (cents: number, type: string | null) => Math.round((cents * deductibleShareBps(type) / 10000) * taxBps / 10000);
  const items: MissedItem[] = [];

  // 1 + 2: outflows whose payee or memo reads like a business cost.
  const unc = { cents: 0, count: 0, saving: 0, types: new Map<string, number>() };
  const wrong = new Map<string, { cents: number; count: number; saving: number; types: Map<string, number> }>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const t of txs) {
    const c = t.categoryId ? cat.get(t.categoryId) : null;
    if (c && (c.type !== "EXPENSE" || c.isSystemManaged || c.isTaxDeductible || c.expenseType === OWNER_DRAW || c.expenseType === UNACCOUNTED)) continue;
    if (t.isTaxDeductible) continue;
    const hit = matchRule(`${t.payee?.name ?? ""} ${t.memo ?? ""}`);
    if (!hit || !BUSINESS.has(hit.type)) continue;
    const cents = -t.amountCents;
    if (!c) { unc.cents += cents; unc.count++; unc.saving += save(cents, hit.type); bump(unc.types, hit.type); continue; }
    // A pocket the user already typed as business is handled by the "unflagged pocket" item below.
    const own = effectiveType(c);
    if (own && BUSINESS.has(own)) continue;
    const w = wrong.get(c.id) ?? { cents: 0, count: 0, saving: 0, types: new Map() };
    w.cents += cents; w.count++; w.saving += save(cents, hit.type); bump(w.types, hit.type);
    wrong.set(c.id, w);
  }
  const top = (m: Map<string, number>) => typeLabel([...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]) ?? "business costs";
  if (unc.count > 0) items.push({
    key: "uncategorized", kind: "uncategorized", title: `${unc.count} uncategorized purchase${unc.count === 1 ? "" : "s"} ${unc.count === 1 ? "looks" : "look"} like business costs`,
    detail: `Mostly ${top(unc.types).toLowerCase()}. Categorize them in a deductible pocket so they count.`, amountCents: unc.cents, count: unc.count, savingCents: unc.saving,
  });
  for (const [id, w] of wrong) {
    const c = cat.get(id)!;
    items.push({
      key: `wrong-${id}`, kind: "wrong-pocket", title: `${w.count} purchase${w.count === 1 ? "" : "s"} in “${c.name}” look like ${top(w.types).toLowerCase()}`,
      detail: `That pocket is not marked deductible. If these were for the business, move them to a deductible pocket.`, amountCents: w.cents, count: w.count, savingCents: w.saving,
    });
  }

  // 3: pockets typed as a business expense (or named like one) that are not marked deductible, with spending in the period.
  const spent = new Map<string, number>();
  const spentTx = await prisma.transaction.groupBy({ by: ["categoryId"], where: { workspaceId, date: { gte: d(from), lte: d(to) }, amountCents: { lt: 0 }, transferGroupId: null, splits: { none: {} }, categoryId: { not: null } }, _sum: { amountCents: true }, _count: true });
  const counts = new Map<string, number>();
  for (const r of spentTx) if (r.categoryId) { spent.set(r.categoryId, -(r._sum.amountCents ?? 0)); counts.set(r.categoryId, r._count); }
  for (const c of cats) {
    if (c.type !== "EXPENSE" || c.isSystemManaged || c.isTaxDeductible || c.expenseType === OWNER_DRAW || c.expenseType === UNACCOUNTED) continue;
    const cents = spent.get(c.id) ?? 0;
    if (cents <= 0) continue;
    const own = effectiveType(c);
    const guess = own ?? matchRule(c.name)?.type ?? null;
    if (!guess || !BUSINESS.has(guess)) continue;
    items.push({
      key: `pocket-${c.id}`, kind: "unflagged-pocket", pocketId: c.id,
      title: `“${c.name}” is ${own ? "a " + typeLabel(own)!.toLowerCase() + " pocket" : "named like " + typeLabel(guess)!.toLowerCase()} but not marked deductible`,
      detail: guess === "MEALS" ? "Meals are generally 50% deductible." : "Marking it deductible counts its spending toward your tax deductions.",
      amountCents: cents, count: counts.get(c.id) ?? 0, savingCents: save(cents, guess),
    });
  }
  return items.filter((i) => i.savingCents > 0).sort((a, b) => b.savingCents - a.savingCents);
}
