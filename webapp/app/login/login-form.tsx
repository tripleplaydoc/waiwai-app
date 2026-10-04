"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { PasswordField } from "@/components/password-field";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus className="input" defaultValue={state?.email ?? ""} placeholder="you@example.com" />
      </div>
      <PasswordField id="password" name="password" label="Password" autoComplete="current-password" />
      {state?.error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C9372C] dark:border-red-900 dark:bg-red-950/40">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">{pending ? "Signing in…" : "Sign in"}</button>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        Forgot your password?{" "}
        <Link href="/setup" className="font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300">Reset it with your setup code</Link>
      </p>
    </form>
  );
}
