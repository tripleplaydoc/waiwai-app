import { prisma } from "@/lib/prisma";

export interface Member { id: string; name: string }

/** How a household member is shown: their name, else the part of their email before the @. */
export const memberName = (u: { name: string | null; email: string }) => u.name?.trim() || u.email.split("@")[0];

/** Everyone who can sign in (the first login is the household owner), oldest first. */
export async function loadMembers(): Promise<Member[]> {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true } });
  return users.map((u) => ({ id: u.id, name: memberName(u) }));
}
