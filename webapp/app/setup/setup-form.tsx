"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setupAction } from "@/app/actions/auth";
import { PasswordField } from "@/components/password-field";

export function SetupForm({ firstTime }: { firstTime: boolean }) {
  const [state, action, pending] = useActionState(setupAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <PasswordField
        id="code" name="code" label="Setup code" autoComplete="off" autoFocus
        hint="The APP_PASSWORD value from your Netlify environment variables."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label">Your name <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="name" name="name" type="text" autoComplete="name" className="input" defaultValue={state?.name ?? ""} />
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required className="input" defaultValue={state?.email ?? ""} placeholder="you@example.com" />
        </div>
      </div>
      <PasswordField id="password" name="password" label="New password" autoComplete="new-password" hint="At least 10 characters." />
      <PasswordField id="confirm" name="confirm" label="Confirm new password" autoComplete="new-password" />
      {state?.error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#DC2626] dark:border-red-900 dark:bg-red-950/40">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Saving…" : firstTime ? "Create account" : "Reset and sign in"}
      </button>
      {!firstTime && (
        <p className="text-center text-xs">
          <Link href="/login" className="font-medium text-[#4F46E5] hover:underline dark:text-indigo-300">Back to sign in</Link>
        </p>
      )}
    </form>
  );
}
