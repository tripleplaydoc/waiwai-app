"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword, passwordProblem } from "@/lib/password";

type FormState = { error?: string; ok?: string } | undefined;
const MAX_MEMBERS = 6;

/** The household owner is the first account created; only they manage who has access. */
async function requireOwner() {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." } as const;
  const owner = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!owner || owner.id !== user.id) return { error: "Only the account owner can manage household access." } as const;
  return { user, ownerId: owner.id } as const;
}

export async function addMemberAction(_prev: FormState, formData: FormData): Promise<NonNullable<FormState>> {
  const auth = await requireOwner();
  if ("error" in auth) return { error: auth.error };
  const parsed = z.object({
    name: z.string().trim().max(80),
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
    password: z.string(),
  }).safeParse({ name: formData.get("name") ?? "", email: formData.get("email") ?? "", password: formData.get("password") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const problem = passwordProblem(parsed.data.password);
  if (problem) return { error: problem };
  if ((await prisma.user.count()) >= MAX_MEMBERS) return { error: `A household can have up to ${MAX_MEMBERS} logins.` };
  if (await prisma.user.findUnique({ where: { email: parsed.data.email } })) return { error: "That email already has a login." };
  await prisma.user.create({ data: { email: parsed.data.email, name: parsed.data.name || null, passwordHash: await hashPassword(parsed.data.password) } });
  revalidatePath("/settings");
  return { ok: `${parsed.data.name || parsed.data.email} can now sign in with that email and password. Ask them to change it in Settings.` };
}

export async function resetMemberPasswordAction(_prev: FormState, formData: FormData): Promise<NonNullable<FormState>> {
  const auth = await requireOwner();
  if ("error" in auth) return { error: auth.error };
  const id = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  const member = await prisma.user.findUnique({ where: { id } });
  if (!member || member.id === auth.ownerId) return { error: "Member not found." };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } }); // also signs them out everywhere
  revalidatePath("/settings");
  return { ok: "Password updated. They've been signed out." };
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const auth = await requireOwner();
  if ("error" in auth) return;
  const id = String(formData.get("userId") ?? "");
  if (!id || id === auth.ownerId) return;
  await prisma.user.delete({ where: { id } });
  revalidatePath("/settings");
}
