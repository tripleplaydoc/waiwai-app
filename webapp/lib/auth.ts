import "server-only";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Single-owner password gate. The app holds real financial data on a public
 * URL, so nothing renders and no server action runs without this cookie.
 * APP_PASSWORD (Netlify environment variable) is the password; the cookie
 * holds an HMAC derived from it, so changing the password logs everyone out.
 */
export const SESSION_COOKIE = "ft_session";

export function passwordConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD && process.env.APP_PASSWORD.length >= 8);
}

function sessionToken(): string {
  return createHmac("sha256", process.env.APP_PASSWORD ?? "").update("financial-tracker-session-v1").digest("hex");
}

export function passwordMatches(attempt: string): boolean {
  if (!passwordConfigured()) return false;
  const a = createHash("sha256").update(attempt).digest();
  const b = createHash("sha256").update(process.env.APP_PASSWORD as string).digest();
  return timingSafeEqual(a, b);
}

export function newSessionValue(): string {
  return sessionToken();
}

export async function isAuthed(): Promise<boolean> {
  if (!passwordConfigured()) return false;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return false;
  const expected = sessionToken();
  if (value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

/** For pages: send signed-out visitors to the login screen. */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthed())) redirect("/login");
}

/** For server actions: refuse to run at all when signed out. */
export async function assertAuthed(): Promise<void> {
  if (!(await isAuthed())) throw new Error("Not signed in.");
}
