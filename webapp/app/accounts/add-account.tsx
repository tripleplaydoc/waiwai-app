"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { createAccountAction } from "@/app/actions/accounts";

export function AddAccountButton({ workspaceId, today }: { workspaceId: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createAccountAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => { if (state?.ok) { setOpen(false); formRef.current?.reset(); } }, [state]);

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> Add account</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add account">
        <form ref={formRef} action={action} className="space-y-3">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <div>
            <label htmlFor="acct-name" className="label">Name</label>
            <input id="acct-name" name="name" required maxLength={80} className="input" placeholder="e.g. Bank of Hawaii Checking" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="acct-type" className="label">Type</label>
              <select id="acct-type" name="type" className="input" defaultValue="CHECKING">
                <option value="CHECKING">Checking</option>
                <option value="SAVINGS">Savings</option>
                <option value="CREDIT_CARD">Credit card</option>
                <option value="CASH">Cash</option>
                <option value="INVESTMENT">Investment (off budget)</option>
                <option value="LOAN">Loan (off budget)</option>
                <option value="PROPERTY">Property (off budget)</option>
                <option value="OTHER_ASSET">Other asset (off budget)</option>
                <option value="OTHER_LIABILITY">Other liability (off budget)</option>
              </select>
            </div>
            <div>
              <label htmlFor="acct-open" className="label">Opening balance</label>
              <input id="acct-open" name="opening" inputMode="decimal" placeholder="0.00" className="input nums" />
            </div>
          </div>
          <div>
            <label htmlFor="acct-date" className="label">Balance as of</label>
            <input id="acct-date" name="openingDate" type="date" defaultValue={today} className="input" />
          </div>
          <p className="text-xs text-slate-500">Use a minus sign for a credit card balance you owe, e.g. -450.00.</p>
          {state && !state.ok && <p role="alert" className="text-sm text-[#C9372C]">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel <span className="kbd">Esc</span></button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save account"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
