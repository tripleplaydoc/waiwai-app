"use server";

import { prisma } from "@/lib/prisma";
import { assertAuthed, getCurrentUser } from "@/lib/auth";
import { getReadyToAssign } from "@/lib/budget/ready-to-assign";
import { addMonthsUTC } from "@/lib/budget/dates";
import { getBudgetSummary } from "@/lib/budget/summary";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { currentMonthIso, todayIso } from "@/lib/utils/dates";
import { rankSuggestions, type HistoryHit, type RuleHint, type Suggestion } from "@/lib/budget/suggest";

export interface QuickAddData {
  workspaceId: string;
  isBusiness: boolean;
  today: string;
  month: string;
  readyToAssignCents: number;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; group: string; type: "INCOME" | "EXPENSE" | "SYSTEM"; availableCents: number; targetType: "MONTHLY_FUNDING" | "TARGET_BALANCE" | "TARGET_BALANCE_BY_DATE" | null; targetCents: number | null; dueDay: number | null; isSystemManaged: boolean; paidFromId: string | null }[];
  payees: string[];
  people: { id: string; name: string }[];
  currentUserId: string | null;
}

/** Loaded when the floating + button is opened, for whichever workspace is showing. */
export async function getQuickAddDataAction(wsParam: string): Promise<QuickAddData> {
  await assertAuthed();
  const ws = await getWorkspace(wsKeyFromParam(wsParam));
  const month = currentMonthIso();
  const monthDate = new Date(`${month}-01T00:00:00.000Z`);
  const [accounts, categories, groups, payees, rta, summary, people, me] = await Promise.all([
    prisma.account.findMany({ where: { workspaceId: ws.id, isArchived: false }, orderBy: [{ onBudget: "desc" }, { name: "asc" }] }),
    prisma.category.findMany({ where: { workspaceId: ws.id, isArchived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.categoryGroup.findMany({ where: { workspaceId: ws.id } }),
    prisma.payee.findMany({ where: { workspaceId: ws.id }, orderBy: { name: "asc" }, take: 200 }),
    getReadyToAssign(prisma, ws.id, new Date(addMonthsUTC(monthDate, 1).getTime() - 1)),
    getBudgetSummary(ws.id, monthDate),
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true } }),
    getCurrentUser(),
  ]);
  const rowById = new Map(summary.rows.map((r) => [r.id, r]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  return {
    workspaceId: ws.id,
    isBusiness: ws.type === "BUSINESS",
    today: todayIso(),
    month,
    readyToAssignCents: rta,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, group: c.categoryGroupId ? groupName.get(c.categoryGroupId) ?? "Other" : "Other", type: c.type, availableCents: rowById.get(c.id)?.availableCents ?? 0, targetType: rowById.get(c.id)?.targetType ?? null, targetCents: rowById.get(c.id)?.targetCents ?? null, dueDay: rowById.get(c.id)?.dueDay ?? null, isSystemManaged: c.isSystemManaged, paidFromId: c.paidFromAccountId })),
    payees: payees.map((p) => p.name),
    people: people.map((u) => ({ id: u.id, name: u.name || u.email.split("@")[0] })),
    currentUserId: me?.id ?? null,
  };
}

export interface SuggestData {
  suggestions: Suggestion[];
  hint: RuleHint | null;
  /** Tax set aside per dollar of deductible expense, in basis points (3000 = 30%). */
  taxBps: number;
}

/** Pocket suggestions for what was typed in Payee / Memo: this workspace's own history first, then built-in rules. */
export async function suggestPocketsAction(wsParam: string, text: string): Promise<SuggestData> {
  await assertAuthed();
  const ws = await getWorkspace(wsKeyFromParam(wsParam));
  const [cats, payees, cfg, profile] = await Promise.all([
    prisma.category.findMany({ where: { workspaceId: ws.id, isArchived: false, type: "EXPENSE" }, include: { categoryGroup: { select: { name: true } } } }),
    prisma.payee.findMany({ where: { workspaceId: ws.id, isArchived: false }, select: { id: true, name: true, defaultCategoryId: true }, take: 1000 }),
    prisma.waterfallConfig.findUnique({ where: { workspaceId: ws.id }, select: { taxBps: true, enabled: true } }),
    prisma.taxProfile.findUnique({ where: { workspaceId: ws.id }, select: { reserveRatePercent: true } }),
  ]);
  const taxBps = cfg?.enabled ? cfg.taxBps : Math.round(Number(profile?.reserveRatePercent ?? 30) * 100);
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const q = clean(text);
  const matched = q.length < 2 ? [] : payees.filter((p) => { const n = clean(p.name); return n.length >= 2 && (n === q || q.includes(n) || n.includes(q)); });
  const history: HistoryHit[] = [];
  if (matched.length > 0) {
    const rows = await prisma.transaction.groupBy({
      by: ["payeeId", "categoryId"],
      where: { workspaceId: ws.id, payeeId: { in: matched.map((p) => p.id) }, categoryId: { not: null }, amountCents: { lt: 0 } },
      _count: { _all: true },
    });
    const byPayee = new Map(matched.map((p) => [p.id, p]));
    for (const r of rows) {
      const p = byPayee.get(r.payeeId!);
      if (p && r.categoryId) history.push({ categoryId: r.categoryId, count: r._count._all, exact: clean(p.name) === q, payee: p.name });
    }
    for (const p of matched) if (p.defaultCategoryId && !history.some((h) => h.categoryId === p.defaultCategoryId)) history.push({ categoryId: p.defaultCategoryId, count: 1, exact: clean(p.name) === q, payee: p.name });
  }
  const r = rankSuggestions({
    text, isBusiness: ws.type === "BUSINESS", history,
    pockets: cats.map((c) => ({ id: c.id, name: c.name, group: c.categoryGroup?.name ?? "Other", expenseType: c.expenseType, isTaxDeductible: c.isTaxDeductible, isSystemManaged: c.isSystemManaged })),
  });
  return { ...r, taxBps };
}
