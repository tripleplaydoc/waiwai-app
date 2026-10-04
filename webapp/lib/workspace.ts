import "server-only";
import { prisma } from "@/lib/prisma";
import type { Workspace } from "@prisma/client";

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
  const existing = await prisma.workspace.findMany({
    where: { isArchived: false },
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

export async function getWorkspace(key: WsKey): Promise<Workspace> {
  const { personal, business } = await ensureWorkspaces();
  return key === "business" ? business : personal;
}
