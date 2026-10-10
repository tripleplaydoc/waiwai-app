"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { Modal } from "@/components/modal";
import { transferAction } from "@/app/actions/funding";
import { formatCents, parseToCents } from "@/lib/utils/currency";

export interface TransferAccount { id: string; name: string; kind?: string }
/** A pocket and how much of its money is held in each bank account (account id -> cents). */
export interface TransferPocket { id: string; name: string; group: string; held: Record<string, number> }

/** Splits `cents` equally across `n` people, the leftover cents going to the first ones. */
function evenSplit(cents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(cents / n);
  const extra = cents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Moves cash between two of your own bank accounts (not spending). Optionally says which pockets that cash belongs to. */
export function TransferButton({ accounts, today, pockets = [], className = "btn btn-sm", label = "Transfer" }: { accounts: TransferAccount[]; today: string; pockets?: TransferPocket[]; className?: string; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [latest, action, pending] = useActionState(transferAction, undefined);
  // The result of the last submit belongs to that visit: opening the dialog again starts clean.
  const [baseline, setBaseline] = useState<typeof latest>(undefined);
  const state = latest !== baseline ? latest : undefined;
  const [fromId, setFromId] = useState(accounts[0]?.id ?? "");
  const [toId, setToId] = useState(accounts[1]?.id ?? "");
  const [amountText, setAmountText] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);

  // Only pockets that hold money in the sending account can be chosen, grouped the way the budget groups them.
  const choices = useMemo(() => {
    const here = pockets.filter((p) => (p.held[fromId] ?? 0) > 0);
    const groups = new Map<string, TransferPocket[]>();
    for (const p of here) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
    return [...groups];
  }, [pockets, fromId]);

  if (accounts.length < 2) return null;
  const done = state?.ok ? state.message : undefined;
  const cents = parseToCents(amountText) ?? 0;
  const chosen = Object.values(picked).reduce((s, v) => s + Math.max(0, parseToCents(v) ?? 0), 0);

  function splitGroup(list: TransferPocket[]) {
    if (cents <= 0) return;
    const parts = evenSplit(cents, list.length);
    setPicked(Object.fromEntries(list.map((p, i) => [p.id, (parts[i] / 100).toFixed(2)])));
  }

  return (
    <>
      <button type="button" className={className} onClick={() => { setBaseline(latest); setPicked({}); setAmountText(""); setOpen(true); }}><ArrowRightLeft className="size-4" aria-hidden /> {label}</button>
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
              <select id="tr-from" name="fromId" className="input" value={fromId} onChange={(e) => { setFromId(e.target.value); setPicked({}); if (e.target.value === toId) setToId(accounts.find((a) => a.id !== e.target.value)?.id ?? ""); }}>
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
                <input id="tr-amount" name="amount" data-autofocus required inputMode="decimal" placeholder="0.00" className="input nums" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
              </div>
              <div>
                <label htmlFor="tr-date" className="label">Date</label>
                <input id="tr-date" name="date" type="date" defaultValue={today} className="input" />
              </div>
            </div>

            {choices.length > 0 && (
              <details className="rounded-xl border border-[#E2E8F0] px-3 py-2 dark:border-slate-700">
                <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold">Which pockets is this money for? <span className="font-normal text-slate-500">(optional)</span></summary>
                <div className="space-y-3 pb-2 pt-1">
                  <p className="text-xs text-slate-500">Pick the pockets this cash belongs to, and its &quot;Held in&quot; label will follow it to the new account. Leave blank and the app spreads it across the pockets held in the sending account.</p>
                  {choices.map(([group, list]) => (
                    <fieldset key={group} className="space-y-1.5">
                      <legend className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        <span>{group}</span>
                        <button type="button" className="btn btn-sm !min-h-9 normal-case tracking-normal" onClick={() => splitGroup(list)} disabled={cents <= 0} title={cents <= 0 ? "Enter the amount first" : `Split ${formatCents(cents)} equally across ${group}`}>Split evenly</button>
                      </legend>
                      {list.map((p) => (
                        <div key={p.id} className="flex items-center gap-3">
                          <label htmlFor={`tr-p-${p.id}`} className="min-w-0 flex-1 text-sm">
                            <span className="block truncate">{p.name}</span>
                            <span className="nums block text-xs text-slate-500">holds {formatCents(p.held[fromId] ?? 0)} here</span>
                          </label>
                          <input id={`tr-p-${p.id}`} name={`pocket_${p.id}`} inputMode="decimal" placeholder="0.00" aria-label={`Amount for ${p.name}`} className="input nums w-28 text-right" value={picked[p.id] ?? ""} onChange={(e) => setPicked((cur) => ({ ...cur, [p.id]: e.target.value }))} />
                        </div>
                      ))}
                    </fieldset>
                  ))}
                  <p className={`nums text-xs font-medium ${chosen > cents && cents > 0 ? "text-warn" : "text-slate-600 dark:text-slate-300"}`} aria-live="polite">
                    Chosen: {formatCents(chosen)}{cents > 0 ? ` of ${formatCents(cents)}` : ""}
                    {cents > 0 && chosen > cents ? " (more than the amount; the extra won't be used)" : ""}
                  </p>
                </div>
              </details>
            )}

            <p className="text-xs text-slate-500">This isn&apos;t spending, so no pocket amount changes. Only the &quot;Held in&quot; labels move, so they match where the cash really is.</p>
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
