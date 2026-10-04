"use client";

import { useActionState, useState } from "react";
import { addMemberAction, removeMemberAction, resetMemberPasswordAction } from "@/app/actions/household";
import { Avatar } from "@/components/avatar";
import { PasswordField } from "@/components/password-field";

function Notice({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (state?.error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-neg dark:border-red-900 dark:bg-red-950/40">{state.error}</p>;
  if (state?.ok) return <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-pos dark:border-emerald-900 dark:bg-emerald-950/40">{state.ok}</p>;
  return null;
}

export function AddMemberForm() {
  const [state, action, pending] = useActionState(addMemberAction, undefined);
  return (
    <form action={action} className="space-y-4" key={state?.ok ?? "form"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="m-name" className="label">Name</label>
          <input id="m-name" name="name" className="input" placeholder="e.g. Sarah" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="m-email" className="label">Their email (their login)</label>
          <input id="m-email" name="email" type="email" required className="input" autoComplete="off" />
        </div>
      </div>
      <PasswordField id="m-pass" name="password" label="Starting password" autoComplete="new-password" hint="At least 10 characters. They can change it in Settings." />
      <Notice state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Adding…" : "Give access"}</button>
    </form>
  );
}

export function MemberRow({ id, name, email, isOwner, isYou, canManage, avatar }: { avatar: string | null; id: string; name: string; email: string; isOwner: boolean; isYou: boolean; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(resetMemberPasswordAction, undefined);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Avatar name={name || email} src={avatar} size={36} />
        <div className="min-w-0 flex-1 basis-40">
          <div className="truncate text-sm font-semibold">{name || email} {isYou && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800">you</span>} {isOwner && <span className="ml-1 rounded bg-cyan-50 px-1.5 py-0.5 text-[11px] font-medium text-water dark:bg-cyan-950/60">owner</span>}</div>
          <div className="truncate text-xs text-slate-500">{email}</div>
        </div>
        {canManage && !isOwner && (
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Reset password</button>
            <form action={removeMemberAction}>
              <input type="hidden" name="userId" value={id} />
              <button type="submit" className="btn btn-sm !text-neg" onClick={(e) => { if (!window.confirm(`Remove ${name || email}'s access?`)) e.preventDefault(); }}>Remove</button>
            </form>
          </div>
        )}
      </div>
      {open && (
        <form action={action} className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
          <input type="hidden" name="userId" value={id} />
          <PasswordField id={`rp-${id}`} name="password" label="New password" autoComplete="new-password" hint="At least 10 characters." />
          <Notice state={state} />
          <button type="submit" disabled={pending} className="btn btn-primary btn-sm">{pending ? "Saving…" : "Set password"}</button>
        </form>
      )}
    </li>
  );
}
