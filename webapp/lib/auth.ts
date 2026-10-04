import "server-only";
import { cache } from "react";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isRealHash } from "@/lib/password";

/**
 * Email + password sign-in for the single owner account.
 *
 *  - The owner's email and a scrypt password hash live in the users table.
 *  - APP_PASSWORD (Netlify env var) is now the *setup / recovery code*: it is
 *    needed to create the account the first time and to reset a forgotten
 *    password. It is never used as the everyday password.
 *  - The session cookie is "<userId>.<hmac>"; the hmac covers the user's
 *    current password hash, so changing the password signs out other devices.
 */
export const SESSION_COOKIE = "ft_session";

export function setupCodeConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD && process.env.APP_PASSWORD.length >= 8);
}

export function setupCodeMatches(attempt: string): boolean {
  if (!setupCodeConfigured()) return false;
  const a = createHash("sha256").update(attempt).digest();
  const b = createHash("sha256").update(process.env.APP_PASSWORD as string).digest();
  return timingSafeEqual(a, b);
}

function sign(userId: string, passwordHash: string): string {
  const key = process.env.SESSION_SECRET || process.env.APP_PASSWORD || "";
  return createHmac("sha256", key).update(`${userId}:${passwordHash}`).digest("hex");
}

export function sessionValueFor(user: { id: string; passwordHash: string }): string {
  return `${user.id}.${sign(user.id, user.passwordHash)}`;
}

/** True once the owner has created their email + password. */
export async function accountReady(): Promise<boolean> {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { passwordHash: true } });
  return Boolean(user && isRealHash(user.passwordHash));
}

export const getCurrentUser = cache(async () => {
  if (!setupCodeConfigured() && !process.env.SESSION_SECRET) return null;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 1) return null;
  const id = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !isRealHash(user.passwordHash)) return null;
  const expected = sign(user.id, user.passwordHash);
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return user;
});

export async function isAuthed(): Promise<boolean> {
  try {
    return (await getCurrentUser()) !== null;
  } catch {
    return false;
  }
}

/** For pages: send signed-out visitors to the login screen. */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthed())) redirect("/login");
}

/** For server actions: refuse to run at all when signed out. */
export async function assertAuthed(): Promise<void> {
  if (!(await isAuthed())) throw new Error("Not signed in.");
}

export async function setSessionCookie(user: { id: string; passwordHash: string }): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, sessionValueFor(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
