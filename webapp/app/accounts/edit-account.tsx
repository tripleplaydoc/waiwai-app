"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Modal } from "@/components/modal";
import { updateAccountAction } from "@/app/actions/accounts";
import { centsToInput } from "@/lib/utils/currency";

export interface EditableAccount { id: string; name: string; type: string; openingBalanceCents: number; openingBalanceDate: string | null; onBudget: boolean; stewardId?: string | null; txCount?: number }

const TYPES: [string, string][] = [
  ["CHECKING", "Checking"], ["SAVINGS", "Savings"], ["CREDIT_CARD", "Credit card"], ["CASH", "Cash"],
  ["INVESTMENT", "Investment (off budget)"], ["LOAN", "Loan (off budget)"], ["PROPERTY", "Property (off budget)"],
  ["OTHER_ASSET", "Other asset (off budget)"], ["OTHER_LIABILITY", "Other liability (off budget)"],
];
const OFF = new Set(["INVESTMENT", "LOAN", "PROPERTY", "OTHER_ASSET", "OTHER_LIABILITY"]);

/** Pencil button + dialog to change an account's name, type and starting balance. */
export function EditAccountButton({ account, label, members = [] }: { account: EditableAccount; label?: string; members?: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(account.type);
  const [state, action, pending] = useActionState(updateAccountAction, undefined);
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);
  const flips = OFF.has(type) !== !account.onBudget;
  return (
    <>
      <button type="button" className="btn btn-sm !min-h-10" onClick={() => { setType(account.type); setOpen(true); }} aria-label={`Edit ${account.name}`}>
        <Pencil className="size-3.5" aria-hidden />{label && <span>{label}</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit account">
        <form action={action} className="space-y-3">
          <input type="hidden" name="accountId" value={account.id} />
          <div>
            <label htmlFor={`ea-name-${account.id}`} className="label">Name</label>
            <input id={`ea-name-${account.id}`} name="name" required maxLength={80} defaultValue={account.name} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`ea-type-${account.id}`} className="label">Type</label>
              <select id={`ea-type-${account.id}`} name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`ea-open-${account.id}`} className="label">Starting balance</label>
              <input id={`ea-open-${account.id}`} name="opening" inputMode="decimal" defaultValue={centsToInput(account.openingBalanceCents)} className="input nums" />
            </div>
          </div>
          {members.length > 1 && !OFF.has(type) && (
            <div>
              <label htmlFor={`ea-steward-${account.id}`} className="label">Steward</label>
              <select id={`ea-steward-${account.id}`} name="stewardId" className="input" defaultValue={account.stewardId ?? ""}>
                <option value="">No steward</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor={`ea-date-${account.id}`} className="label">Balance as of</label>
            <input id={`ea-date-${account.id}`} name="openingDate" type="date" defaultValue={account.openingBalanceDate ?? ""} className="input" />
          </div>
          <p className="text-xs text-slate-500">The balance is the starting balance plus every transaction. Changing the starting balance never touches your transactions. Use a minus sign for money you owe.</p>
          {flips && <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">Switching between on-budget and off-budget changes your money in pool.</p>}
          {state && !state.ok && <p role="alert" className="text-sm text-[#C9372C]">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel <span className="kbd">Esc</span></button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
