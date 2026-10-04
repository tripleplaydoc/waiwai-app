"use client";

import { useActionState } from "react";
import { changePasswordAction, updateProfileAction } from "@/app/actions/settings";
import { PasswordField } from "@/components/password-field";

function Notice({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (state?.error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#DC2626] dark:border-red-900 dark:bg-red-950/40">{state.error}</p>;
  if (state?.ok) return <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-[#059669] dark:border-emerald-900 dark:bg-emerald-950/40">{state.ok}</p>;
  return null;
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="p-name" className="label">Name</label>
          <input id="p-name" name="name" defaultValue={name} className="input" autoComplete="name" />
        </div>
        <div>
          <label htmlFor="p-email" className="label">Email (your login)</label>
          <input id="p-email" name="email" type="email" defaultValue={email} required className="input" autoComplete="username" />
        </div>
      </div>
      <Notice state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Saving…" : "Save profile"}</button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="space-y-4" key={state?.ok ?? "form"}>
      <PasswordField id="c-current" name="current" label="Current password" autoComplete="current-password" />
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField id="c-next" name="next" label="New password" autoComplete="new-password" hint="At least 10 characters." />
        <PasswordField id="c-confirm" name="confirm" label="Confirm new password" autoComplete="new-password" />
      </div>
      <Notice state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Updating…" : "Change password"}</button>
    </form>
  );
}
