"use server";

import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { getReadyToAssign } from "@/lib/budget/ready-to-assign";
import { addMonthsUTC } from "@/lib/budget/dates";
import { getBudgetSummary } from "@/lib/budget/summary";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { currentMonthIso, todayIso } from "@/lib/utils/dates";

export interface QuickAddData {
  workspaceId: string;
  isBusiness: boolean;
  today: string;
  month: string;
  readyToAssignCents: number;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; group: string; type: "INCOME" | "EXPENSE" | "SYSTEM"; availableCents: number }[];
  payees: string[];
}

/** Loaded when the floating + button is opened, for whichever workspace is showing. */
export async function getQuickAddDataAction(wsParam: string): Promise<QuickAddData> {
  await assertAuthed();
  const ws = await getWorkspace(wsKeyFromParam(wsParam));
  const month = currentMonthIso();
  const monthDate = new Date(`${month}-01T00:00:00.000Z`);
  const [accounts, categories, groups, payees, rta, summary] = await Promise.all([
    prisma.account.findMany({ where: { workspaceId: ws.id, isArchived: false }, orderBy: [{ onBudget: "desc" }, { name: "asc" }] }),
    prisma.category.findMany({ where: { workspaceId: ws.id, isArchived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.categoryGroup.findMany({ where: { workspaceId: ws.id } }),
    prisma.payee.findMany({ where: { workspaceId: ws.id }, orderBy: { name: "asc" }, take: 200 }),
    getReadyToAssign(prisma, ws.id, new Date(addMonthsUTC(monthDate, 1).getTime() - 1)),
    getBudgetSummary(ws.id, monthDate),
  ]);
  const avail = new Map(summary.rows.map((r) => [r.id, r.availableCents]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  return {
    workspaceId: ws.id,
    isBusiness: ws.type === "BUSINESS",
    today: todayIso(),
    month,
    readyToAssignCents: rta,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, group: c.categoryGroupId ? groupName.get(c.categoryGroupId) ?? "Other" : "Other", type: c.type, availableCents: avail.get(c.id) ?? 0 })),
    payees: payees.map((p) => p.name),
  };
}
