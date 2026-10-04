"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, newSessionValue, passwordConfigured, passwordMatches } from "@/lib/auth";

export async function loginAction(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  if (!passwordConfigured()) {
    return { error: "APP_PASSWORD is not set (or is shorter than 8 characters) in the site's environment variables." };
  }
  const attempt = String(formData.get("password") ?? "");
  if (!passwordMatches(attempt)) {
    await new Promise((r) => setTimeout(r, 800)); // slows down guessing
    return { error: "That password isn't right." };
  }
  (await cookies()).set(SESSION_COOKIE, newSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/budget");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
