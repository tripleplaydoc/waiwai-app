"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { Modal } from "@/components/modal";
import { transferAction } from "@/app/actions/funding";

export interface TransferAccount { id: string; name: string; kind?: string }

/** Moves cash between two of your own bank accounts (not spending). */
export function TransferButton({ accounts, today, className = "btn btn-sm", label = "Transfer" }: { accounts: TransferAccount[]; today: string; className?: string; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [latest, action, pending] = useActionState(transferAction, undefined);
  // The result of the last submit belongs to that visit: opening the dialog again starts clean.
  const [baseline, setBaseline] = useState<typeof latest>(undefined);
  const state = latest !== baseline ? latest : undefined;
  const [fromId, setFromId] = useState(accounts[0]?.id ?? "");
  const [toId, setToId] = useState(accounts[1]?.id ?? "");
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  if (accounts.length < 2) return null;
  const done = state?.ok ? state.message : undefined;

  return (
    <>
      <button type="button" className={className} onClick={() => { setBaseline(latest); setOpen(true); }}><ArrowRightLeft className="size-4" aria-hidden /> {label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Move cash between accounts">
        {done ? (
          <div className="space-y-3">
            <p role="status" className="rounded-xl bg-pos-soft px-3 py-2 text-sm text-pos">{done}</p>
            <div className="flex justify-end"><button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>Done</button></div>
          </div>
        ) : (
          <form action={action} className="space-y-3">
            <div>
              <label htmlFor="tr-from" className="label">From</label>
              <select id="tr-from" name="fromId" className="input" value={fromId} onChange={(e) => { setFromId(e.target.value); if (e.target.value === toId) setToId(accounts.find((a) => a.id !== e.target.value)?.id ?? ""); }}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.kind ? ` (${a.kind})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="tr-to" className="label">To</label>
              <select id="tr-to" name="toId" className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
                {accounts.filter((a) => a.id !== fromId).map((a) => <option key={a.id} value={a.id}>{a.name}{a.kind ? ` (${a.kind})` : ""}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="tr-amount" className="label">Amount</label>
                <input id="tr-amount" name="amount" data-autofocus required inputMode="decimal" placeholder="0.00" className="input nums" />
              </div>
              <div>
                <label htmlFor="tr-date" className="label">Date</label>
                <input id="tr-date" name="date" type="date" defaultValue={today} className="input" />
              </div>
            </div>
            <p className="text-xs text-slate-500">This isn&apos;t spending, so no pocket changes. If the sending account has less free cash than you move, the pocket money held there moves along so your tags stay true.</p>
            {state && !state.ok && <p role="alert" className="text-sm text-neg">{state.error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel <span className="kbd">Esc</span></button>
              <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Moving…" : "Move cash"}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
