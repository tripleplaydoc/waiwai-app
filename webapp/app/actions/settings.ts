"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, setSessionCookie } from "@/lib/auth";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";

type FormState = { error?: string; ok?: string } | undefined;

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<{ error?: string; ok?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };
  const parsed = z
    .object({
      name: z.string().trim().max(80),
      email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
    })
    .safeParse({ name: formData.get("name") ?? "", email: formData.get("email") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const taken = await prisma.user.findFirst({ where: { email: parsed.data.email, NOT: { id: user.id } } });
  if (taken) return { error: "That email is already in use." };
  await prisma.user.update({ where: { id: user.id }, data: { email: parsed.data.email, name: parsed.data.name || null } });
  revalidatePath("/settings");
  return { ok: "Profile saved." };
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<{ error?: string; ok?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "Your current password isn't right." };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  if (next !== confirm) return { error: "The two new passwords don't match." };
  const passwordHash = await hashPassword(next);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await setSessionCookie(updated); // keeps this device signed in; other devices are signed out
  return { ok: "Password changed. Other devices have been signed out." };
}

const AVATAR_MAX = 400 * 1024;

export async function updateAvatarAction(_prev: FormState, formData: FormData): Promise<{ error?: string; ok?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };
  const f = formData.get("avatar");
  if (!(f instanceof File) || f.size === 0) return { error: "Choose a picture first." };
  if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return { error: "Use a JPG, PNG or WebP picture." };
  if (f.size > AVATAR_MAX) return { error: "That picture is too large. Try a smaller one." };
  await prisma.user.update({ where: { id: user.id }, data: { avatarData: new Uint8Array(await f.arrayBuffer()), avatarMime: f.type } });
  revalidatePath("/", "layout");
  return { ok: "Profile picture updated." };
}

export async function removeAvatarAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.user.update({ where: { id: user.id }, data: { avatarData: null, avatarMime: null } });
  revalidatePath("/", "layout");
}
