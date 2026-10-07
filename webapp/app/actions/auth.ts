"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, setSessionCookie, setupCodeConfigured, setupCodeMatches } from "@/lib/auth";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";

type FormState = { error?: string; email?: string; name?: string } | undefined;

const slow = () => new Promise((r) => setTimeout(r, 800)); // slows down guessing

export async function loginAction(_prev: FormState, formData: FormData): Promise<NonNullable<FormState>> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    await slow();
    return { error: "That email and password don't match.", email };
  }
  await setSessionCookie(user);
  redirect("/home");
}

const setupSchema = z.object({
  code: z.string().min(1, "Enter the setup code."),
  name: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  password: z.string(),
  confirm: z.string(),
});

/**
 * Creates the owner account the first time, and resets email/password later
 * if it's forgotten. Protected by the APP_PASSWORD setup code.
 */
export async function setupAction(_prev: FormState, formData: FormData): Promise<NonNullable<FormState>> {
  const keep = { email: String(formData.get("email") ?? ""), name: String(formData.get("name") ?? "") };
  if (!setupCodeConfigured()) return { error: "APP_PASSWORD (the setup code) isn't configured in Netlify yet.", ...keep };
  const parsed = setupSchema.safeParse({
    code: formData.get("code") ?? "",
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    confirm: formData.get("confirm") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again.", ...keep };
  const { code, name, email, password, confirm } = parsed.data;

  if (!setupCodeMatches(code)) {
    await slow();
    return { error: "That setup code isn't right.", ...keep };
  }
  const problem = passwordProblem(password);
  if (problem) return { error: problem, ...keep };
  if (password !== confirm) return { error: "The two passwords don't match.", ...keep };

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { email, passwordHash, ...(name ? { name } : {}) } })
    : await prisma.user.create({ data: { email, passwordHash, name: name || null } });
  await setSessionCookie(user);
  redirect("/home");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  (await cookies()).delete("ft_view");
  redirect("/login");
}

