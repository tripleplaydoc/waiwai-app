"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus className="input" />
      </div>
      {state?.error && <p role="alert" className="text-sm text-[#DC2626]">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">{pending ? "Checking…" : "Sign in"}</button>
    </form>
  );
}
