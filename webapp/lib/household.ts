import { prisma } from "@/lib/prisma";
import { budgetPeopleWhere } from "@/lib/workspace";

export interface Member { id: string; name: string }

/** How a household member is shown: their name, else the part of their email before the @. */
export const memberName = (u: { name: string | null; email: string }) => u.name?.trim() || u.email.split("@")[0];

/** The people in the budget being viewed: household members, or just the one person for a private budget. Oldest first. */
export async function loadMembers(): Promise<Member[]> {
  const users = await prisma.user.findMany({ where: await budgetPeopleWhere(), orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true } });
  return users.map((u) => ({ id: u.id, name: memberName(u) }));
}
