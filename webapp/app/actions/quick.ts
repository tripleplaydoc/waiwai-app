"use server";

import { prisma } from "@/lib/prisma";
import { assertAuthed, getCurrentUser } from "@/lib/auth";
import { getReadyToAssign } from "@/lib/budget/ready-to-assign";
import { addMonthsUTC } from "@/lib/budget/dates";
import { getBudgetSummary } from "@/lib/budget/summary";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { currentMonthIso, todayIso } from "@/lib/utils/dates";
import { effectiveType } from "@/lib/budget/expense-types";
import { rankSuggestions, type RuleHint, type Suggestion } from "@/lib/budget/suggest";
import { historyForTexts } from "@/lib/budget/suggest-history";

export interface QuickAddData {
  workspaceId: string;
  isBusiness: boolean;
  today: string;
  month: string;
  readyToAssignCents: number;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; group: string; type: "INCOME" | "EXPENSE" | "SYSTEM"; availableCents: number; targetType: "MONTHLY_FUNDING" | "TARGET_BALANCE" | "TARGET_BALANCE_BY_DATE" | null; targetCents: number | null; dueDay: number | null; isSystemManaged: boolean; paidFromId: string | null; expenseType: string | null }[];
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
    categories: categories.map((c) => ({ id: c.id, name: c.name, group: c.categoryGroupId ? groupName.get(c.categoryGroupId) ?? "Other" : "Other", type: c.type, availableCents: rowById.get(c.id)?.availableCents ?? 0, targetType: rowById.get(c.id)?.targetType ?? null, targetCents: rowById.get(c.id)?.targetCents ?? null, dueDay: rowById.get(c.id)?.dueDay ?? null, isSystemManaged: c.isSystemManaged, paidFromId: c.paidFromAccountId, expenseType: effectiveType(c) })),
    payees: payees.map((p) => p.name),
    people: people.map((u) => ({ id: u.id, name: u.name || u.email.split("@")[0] })),
    currentUserId: me?.id ?? null,
  };
}

/** One suggested pocket per imported row (null = no confident suggestion). */
export interface ImportSuggestion { categoryId: string; name: string; reason: string; deductible: boolean; source: "history" | "rule" | "name" }
export interface ImportSuggestData { suggestions: (ImportSuggestion | null)[]; taxBps: number; isBusiness: boolean }

/** Top suggestion for each statement row (money out only), from this workspace's history and the built-in vendor rules. */
export async function suggestForImportAction(accountId: string, rows: { payee: string; memo: string; amountCents: number }[]): Promise<ImportSuggestData> {
  await assertAuthed();
  const acct = await prisma.account.findUnique({ where: { id: accountId }, select: { workspaceId: true } });
  if (!acct) return { suggestions: rows.map(() => null), taxBps: 3000, isBusiness: false };
  const [ws, cats, cfg, profile] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: acct.workspaceId }, select: { type: true } }),
    prisma.category.findMany({ where: { workspaceId: acct.workspaceId, isArchived: false, type: "EXPENSE" }, include: { categoryGroup: { select: { name: true } } } }),
    prisma.waterfallConfig.findUnique({ where: { workspaceId: acct.workspaceId }, select: { taxBps: true, enabled: true } }),
    prisma.taxProfile.findUnique({ where: { workspaceId: acct.workspaceId }, select: { reserveRatePercent: true } }),
  ]);
  const taxBps = cfg?.enabled ? cfg.taxBps : Math.round(Number(profile?.reserveRatePercent ?? 30) * 100);
  const pockets = cats.map((c) => ({ id: c.id, name: c.name, group: c.categoryGroup?.name ?? "Other", expenseType: c.expenseType, isTaxDeductible: c.isTaxDeductible, isSystemManaged: c.isSystemManaged }));
  const hist = await historyForTexts(acct.workspaceId, rows.map((r) => r.payee));
  const cache = new Map<string, ImportSuggestion | null>();
  const suggestions = rows.map((r) => {
    if (r.amountCents >= 0) return null;
    const text = `${r.payee} ${r.memo}`.trim();
    const key = `${r.payee}|${text}`;
    if (cache.has(key)) return cache.get(key)!;
    const top = rankSuggestions({ text, isBusiness: ws.type === "BUSINESS", pockets, history: hist.get(r.payee.trim()) ?? [], max: 1 }).suggestions[0];
    const v = top ? { categoryId: top.categoryId, name: top.name, reason: top.reason, deductible: top.deductible, source: top.source } : null;
    cache.set(key, v);
    return v;
  });
  return { suggestions, taxBps, isBusiness: ws.type === "BUSINESS" };
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
  const history = (await historyForTexts(ws.id, [text])).get(text.trim()) ?? [];
  const r = rankSuggestions({
    text, isBusiness: ws.type === "BUSINESS", history,
    pockets: cats.map((c) => ({ id: c.id, name: c.name, group: c.categoryGroup?.name ?? "Other", expenseType: c.expenseType, isTaxDeductible: c.isTaxDeductible, isSystemManaged: c.isSystemManaged })),
  });
  return { ...r, taxBps };
}
