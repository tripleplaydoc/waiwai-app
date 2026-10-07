"use client";

import { useActionState, useState } from "react";
import { addMemberAction, removeMemberAction, resetMemberPasswordAction, switchBudgetAction } from "@/app/actions/household";
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
      <fieldset className="space-y-2">
        <legend className="label">Their budget</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E2E8F0] p-3 dark:border-slate-700">
          <input type="radio" name="budget" value="PRIVATE" defaultChecked className="mt-1" />
          <span className="text-sm"><strong>Their own private budget</strong> (best for kids). Separate accounts and pockets, no Business. Other kids can&apos;t see it. You can open it from the switcher.</span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E2E8F0] p-3 dark:border-slate-700">
          <input type="radio" name="budget" value="SHARED" className="mt-1" />
          <span className="text-sm"><strong>Shares the household budget</strong> (best for a spouse). Sees the same Personal and Business budgets as you.</span>
        </label>
      </fieldset>
      <PasswordField id="m-pass" name="password" label="Starting password" autoComplete="new-password" hint="At least 10 characters. They can change it in Settings." />
      <Notice state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Adding…" : "Give access"}</button>
    </form>
  );
}

export function MemberRow({ id, name, email, isOwner, isYou, canManage, avatar, isPrivate }: { isPrivate: boolean; avatar: string | null; id: string; name: string; email: string; isOwner: boolean; isYou: boolean; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(resetMemberPasswordAction, undefined);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Avatar name={name || email} src={avatar} size={36} />
        <div className="min-w-0 flex-1 basis-40">
          <div className="truncate text-sm font-semibold">{name || email} {isYou && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800">you</span>} {isOwner && <span className="ml-1 rounded bg-cyan-50 px-1.5 py-0.5 text-[11px] font-medium text-water dark:bg-cyan-950/60">owner</span>} {isPrivate && <span className="ml-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-950/60">own budget</span>}</div>
          <div className="truncate text-xs text-slate-500">{email}</div>
        </div>
        {isPrivate && !isYou && (
          <form action={switchBudgetAction}>
            <input type="hidden" name="userId" value={id} />
            <button type="submit" className="btn btn-sm">Open budget</button>
          </form>
        )}
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
