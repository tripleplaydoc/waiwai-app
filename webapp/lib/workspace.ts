import "server-only";
import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Workspace } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";

/** Cookie a household member uses to open someone's private budget. */
export const VIEW_COOKIE = "ft_view";

export type WsKey = "personal" | "business";

export function wsKeyFromParam(param: string | string[] | undefined): WsKey {
  return param === "business" ? "business" : "personal";
}

/**
 * First-run bootstrap. There is a single owner; the owner signs in with
 * email + password. Creates the
 * Personal and Business workspaces (and the Business "Estimated Tax Reserve"
 * system envelope + tax profile) the first time the app runs. Idempotent.
 */
export async function ensureWorkspaces(): Promise<{ personal: Workspace; business: Workspace }> {
  // Only the household's own budgets: private budgets (kids, others) are owned by PRIVATE users and never match here.
  const existing = await prisma.workspace.findMany({
    where: { isArchived: false, owner: { budgetMode: "SHARED" } },
    orderBy: { createdAt: "asc" },
  });
  let personal = existing.find((w) => w.type === "PERSONAL");
  let business = existing.find((w) => w.type === "BUSINESS");
  if (personal && business) return { personal, business };

  // Single owner: reuse the account created at sign-up (its email can change),
  // or make a placeholder that sign-up will take over.
  const owner =
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } })) ??
    (await prisma.user.create({ data: { email: "owner@financial-tracker.local", name: "Owner", passwordHash: "!setup-pending" } }));

  if (!personal) {
    personal = await prisma.workspace.create({ data: { ownerId: owner.id, name: "Personal", type: "PERSONAL" } });
    await seedCategories(personal.id, "PERSONAL");
  }
  if (!business) {
    business = await prisma.workspace.create({ data: { ownerId: owner.id, name: "Business", type: "BUSINESS" } });
    const reserve = await seedCategories(business.id, "BUSINESS");
    await prisma.taxProfile.create({
      data: { workspaceId: business.id, reserveCategoryId: reserve ?? null },
    });
  }
  return { personal, business };
}

/** Starter envelopes so the budget screen is usable immediately. Returns the tax-reserve category id for BUSINESS. */
async function seedCategories(workspaceId: string, type: "PERSONAL" | "BUSINESS"): Promise<string | undefined> {
  const income = await prisma.categoryGroup.create({ data: { workspaceId, name: "Income", sortOrder: 0 } });
  await prisma.category.create({
    data: { workspaceId, categoryGroupId: income.id, name: type === "BUSINESS" ? "Business Revenue" : "Paycheck", type: "INCOME", expenseType: type === "BUSINESS" ? "SALES" : "PAYCHECK" },
  });

  if (type === "PERSONAL") {
    const kinds: Record<string, string> = {
      "Rent / Mortgage": "HOUSING", Utilities: "UTILITIES", "Phone & Internet": "UTILITIES", Insurance: "INSURANCE",
      Groceries: "FOOD", "Gas & Transportation": "TRANSPORT", "Dining Out": "DINING", "Emergency Fund": "SAVINGS",
    };
    const groups: [string, string[]][] = [
      ["Bills", ["Rent / Mortgage", "Utilities", "Phone & Internet", "Insurance"]],
      ["Everyday", ["Groceries", "Gas & Transportation", "Dining Out"]],
      ["Savings", ["Emergency Fund"]],
    ];
    let order = 1;
    for (const [gName, cats] of groups) {
      const g = await prisma.categoryGroup.create({ data: { workspaceId, name: gName, sortOrder: order++ } });
      let i = 0;
      for (const name of cats) {
        await prisma.category.create({ data: { workspaceId, categoryGroupId: g.id, name, sortOrder: i++, expenseType: kinds[name] } });
      }
    }
    return undefined;
  }

  const tax = await prisma.categoryGroup.create({ data: { workspaceId, name: "Taxes", sortOrder: 1 } });
  const reserve = await prisma.category.create({
    data: { workspaceId, categoryGroupId: tax.id, name: "Estimated Tax Reserve", type: "SYSTEM", isSystemManaged: true },
  });
  const ops = await prisma.categoryGroup.create({ data: { workspaceId, name: "Operating Expenses", sortOrder: 2 } });
  const opCats: [string, "ADVERTISING" | "SOFTWARE_AND_SUBSCRIPTIONS" | "OFFICE_EXPENSE" | "TRAVEL" | "SUPPLIES"][] = [
    ["Advertising", "ADVERTISING"],
    ["Software & Subscriptions", "SOFTWARE_AND_SUBSCRIPTIONS"],
    ["Office Expenses", "OFFICE_EXPENSE"],
    ["Travel", "TRAVEL"],
    ["Supplies", "SUPPLIES"],
  ];
  let i = 0;
  for (const [name, line] of opCats) {
    await prisma.category.create({
      data: { workspaceId, categoryGroupId: ops.id, name, sortOrder: i++, isTaxDeductible: true, scheduleCLineItem: line },
    });
  }
  return reserve.id;
}

/** A private person's own Personal budget (created the first time it is needed). No Business workspace. */
export async function ensureOwnWorkspace(userId: string): Promise<Workspace> {
  const found = await prisma.workspace.findFirst({ where: { ownerId: userId, type: "PERSONAL", isArchived: false }, orderBy: { createdAt: "asc" } });
  if (found) return found;
  const ws = await prisma.workspace.create({ data: { ownerId: userId, name: "Personal", type: "PERSONAL" } });
  await seedCategories(ws.id, "PERSONAL");
  return ws;
}

export interface BudgetView {
  /** Who is signed in. */
  me: { id: string; name: string | null; email: string; budgetMode: string };
  /** Set when a PRIVATE person's budget is the one in front of us (their own, or a household member opening it). */
  privateUser: { id: string; name: string | null; email: string } | null;
  /** A household member is looking at someone else's budget. */
  viewingOther: boolean;
}

/**
 * Whose budget this request is about.
 *  - A PRIVATE person always sees only their own budget.
 *  - A household (SHARED) member sees the household budgets, unless they have chosen to open a private person's budget.
 */
export const getBudgetView = cache(async (): Promise<BudgetView | null> => {
  const me = await getCurrentUser();
  if (!me) return null;
  const base = { id: me.id, name: me.name, email: me.email, budgetMode: me.budgetMode };
  if (me.budgetMode === "PRIVATE") return { me: base, privateUser: base, viewingOther: false };
  let id: string | undefined;
  try { id = (await cookies()).get(VIEW_COOKIE)?.value; } catch { id = undefined; }
  if (id) {
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, budgetMode: true } });
    if (target && target.budgetMode === "PRIVATE") return { me: base, privateUser: target, viewingOther: true };
  }
  return { me: base, privateUser: null, viewingOther: false };
});

/** The workspace for this request. Private budgets have only a Personal workspace, so "business" falls back to it. */
export async function getWorkspace(key: WsKey): Promise<Workspace> {
  const view = await getBudgetView();
  if (view?.privateUser) return ensureOwnWorkspace(view.privateUser.id);
  const { personal, business } = await ensureWorkspaces();
  return key === "business" ? business : personal;
}

/** Every workspace in the budget being viewed: both household ones, or the one private budget. Used for all-in-one totals. */
export async function getScopeWorkspaceIds(): Promise<string[]> {
  const view = await getBudgetView();
  if (view?.privateUser) return [(await ensureOwnWorkspace(view.privateUser.id)).id];
  return Object.values(await ensureWorkspaces()).map((w) => w.id);
}

/** Which logins count as "people" in the budget being viewed (for who-paid pickers and per-person reports). */
export async function budgetPeopleWhere(): Promise<{ id: string } | { budgetMode: string }> {
  const view = await getBudgetView();
  return view?.privateUser ? { id: view.privateUser.id } : { budgetMode: "SHARED" };
}

/** True when this workspace belongs to the budget being viewed (never a different person's private budget). */
export async function canAccessWorkspace(workspaceId: string): Promise<boolean> {
  return (await getScopeWorkspaceIds()).includes(workspaceId);
}

/** For server actions that receive a workspace id from the browser. */
export async function assertWorkspaceAccess(workspaceId: string): Promise<void> {
  if (!(await canAccessWorkspace(workspaceId))) throw new Error("That budget isn't available to you.");
}
