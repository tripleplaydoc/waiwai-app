"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowRightLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { archiveHoldingAction, createHoldingAction, moveHoldingAction, updateHoldingAction } from "@/app/actions/accounts";
import { HOLDING_DEFS, type HoldingKey } from "@/lib/holdings";
import { centsToInput } from "@/lib/utils/currency";

export interface HoldingEdit { id: string; name: string; cls: HoldingKey; valueCents: number; monthlyCents: number; manual: boolean }

export function HoldingButton({ workspaceId, today, edit, moveTo }: { workspaceId: string; today: string; edit?: HoldingEdit; moveTo?: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [cls, setCls] = useState<HoldingKey>(edit?.cls ?? "STOCKS_FUNDS");
  const [state, action, pending] = useActionState(edit ? updateHoldingAction : createHoldingAction, undefined);
  const [removing, startRemove] = useTransition();
  const [err, setErr] = useState<string>();
  const [confirmMove, setConfirmMove] = useState(false);
  const [moving, startMove] = useTransition();
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);
  const side = HOLDING_DEFS.find((h) => h.key === cls)!.side;
  const id = edit?.id ?? "new";
  return (
    <>
      {edit ? (
        <button type="button" className="btn btn-sm !min-h-10" onClick={() => { setCls(edit.cls); setOpen(true); }} aria-label={`Edit ${edit.name}`}><Pencil className="size-3.5" aria-hidden /></button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> Add</button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={edit ? "Edit" : "Add asset or liability"}>
        <form action={action} className="space-y-3">
          {edit ? <input type="hidden" name="accountId" value={edit.id} /> : <input type="hidden" name="workspaceId" value={workspaceId} />}
          <div>
            <label htmlFor={`h-name-${id}`} className="label">Name</label>
            <input id={`h-name-${id}`} name="name" required maxLength={80} defaultValue={edit?.name} className="input" placeholder="e.g. Waikiki condo, Vanguard IRA, Car loan" />
          </div>
          <div>
            <label htmlFor={`h-cls-${id}`} className="label">What is it?</label>
            <select id={`h-cls-${id}`} name="cls" className="input" value={cls} onChange={(e) => setCls(e.target.value as HoldingKey)}>
              <optgroup label="Assets (you own)">{HOLDING_DEFS.filter((h) => h.side === "ASSET").map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}</optgroup>
              <optgroup label="Liabilities (you owe)">{HOLDING_DEFS.filter((h) => h.side === "LIABILITY").map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}</optgroup>
            </select>
          </div>
          {(!edit || edit.manual) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`h-val-${id}`} className="label">{side === "ASSET" ? "Worth now" : "Owed now"}</label>
                <input id={`h-val-${id}`} name="value" inputMode="decimal" required={!edit} defaultValue={edit ? centsToInput(edit.valueCents) : ""} className="input nums" placeholder="0.00" />
              </div>
              <div>
                <label htmlFor={`h-date-${id}`} className="label">As of</label>
                <input id={`h-date-${id}`} name="asOf" type="date" defaultValue={today} className="input" />
              </div>
            </div>
          )}
          {edit && !edit.manual && <input type="hidden" name="asOf" value={today} />}
          {edit && !edit.manual && <input type="hidden" name="value" value="" />}
          <div>
            <label htmlFor={`h-mo-${id}`} className="label">{side === "ASSET" ? "Income it produces each month" : "Payment each month"} <span className="font-normal text-slate-500">(optional)</span></label>
            <input id={`h-mo-${id}`} name="monthly" inputMode="decimal" defaultValue={edit && edit.monthlyCents ? centsToInput(edit.monthlyCents) : ""} className="input nums" placeholder="0.00" />
          </div>
          <p className="text-xs text-slate-500">Each time you update the value, WaiWai keeps the old one, so the reports can show growth over time.</p>
          {state && !state.ok && <p role="alert" className="text-sm text-[#C9372C]">{state.error}</p>}
          {err && <p role="alert" className="text-sm text-[#C9372C]">{err}</p>}
          {edit && moveTo && (
            confirmMove ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E2E8F0] p-3 text-sm dark:border-slate-700">
                <span className="min-w-0 flex-1">Move <strong>{edit.name}</strong> to {moveTo.name}? It leaves this workspace&apos;s totals and joins {moveTo.name}&apos;s, with its history.</span>
                <button type="button" className="btn btn-sm btn-primary" disabled={moving}
                  onClick={() => startMove(async () => { const r = await moveHoldingAction(edit.id, moveTo.id); if (r.ok) { setConfirmMove(false); setOpen(false); } else { setErr(r.error); setConfirmMove(false); } })}>{moving ? "Moving…" : "Yes, move it"}</button>
                <button type="button" className="btn btn-sm" onClick={() => setConfirmMove(false)}>Keep here</button>
              </div>
            ) : (
              <button type="button" className="btn w-full" onClick={() => { setErr(undefined); setConfirmMove(true); }}><ArrowRightLeft className="size-4" aria-hidden /> Move to {moveTo.name}</button>
            )
          )}
          <div className="flex items-center gap-2 pt-1">
            {edit?.manual && (
              <button type="button" className="btn btn-sm" disabled={removing} aria-label="Remove"
                onClick={() => { if (!window.confirm(`Remove ${edit.name}? Its history stays out of the reports.`)) return; startRemove(async () => { const r = await archiveHoldingAction(edit.id); if (r.ok) setOpen(false); else setErr(r.error); }); }}>
                <Trash2 className="size-3.5" aria-hidden /> Remove
              </button>
            )}
            <button type="button" className="btn ml-auto" onClick={() => setOpen(false)}>Cancel <span className="kbd">Esc</span></button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
