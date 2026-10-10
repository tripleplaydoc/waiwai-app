"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Droplets } from "lucide-react";
import { Modal } from "@/components/modal";
import { setHeldInAction } from "@/app/actions/funding";
import { centsToInput, formatCents } from "@/lib/utils/currency";
import type { TransferAccount, TransferPocket } from "@/components/transfer-button";

/**
 * Fixes where pocket money is held between two bank accounts, one pocket at a time.
 * Only the "Held in" labels change; no pocket amount, bank balance or Pool amount does.
 */
export function HeldInButton({ accounts, pockets, className = "btn btn-sm" }: { accounts: TransferAccount[]; pockets: TransferPocket[]; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [latest, action, pending] = useActionState(setHeldInAction, undefined);
  const [baseline, setBaseline] = useState<typeof latest>(undefined);
  const state = latest !== baseline ? latest : undefined;
  const [aId, setAId] = useState(accounts[0]?.id ?? "");
  const [bId, setBId] = useState(accounts[1]?.id ?? "");
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);

  const rows = useMemo(() => {
    const here = pockets.filter((p) => (p.held[aId] ?? 0) + (p.held[bId] ?? 0) > 0);
    const groups = new Map<string, TransferPocket[]>();
    for (const p of here) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
    return [...groups];
  }, [pockets, aId, bId]);

  if (accounts.length < 2 || pockets.length === 0) return null;
  const done = state?.ok ? state.message : undefined;
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? "account";
  const all = rows.flatMap(([, list]) => list);
  const fresh = () => { setBaseline(latest); setVals({}); setAId(accounts[0]?.id ?? ""); setBId(accounts[1]?.id ?? ""); setOpen(true); };

  return (
    <>
      <button type="button" className={className} onClick={fresh}><Droplets className="size-4" aria-hidden /> Held in</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Where each pocket's cash is held" wide>
        {done ? (
          <div className="space-y-3">
            <p role="status" className="rounded-xl bg-pos-soft px-3 py-2 text-sm text-pos">{done}</p>
            <div className="flex justify-end"><button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>Done</button></div>
          </div>
        ) : (
          <form action={action} className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">Pick two accounts, then say how much of each pocket&apos;s money sits in the second one. Nothing is spent or moved at the bank, and no pocket gets more or less.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="hi-a" className="label">First account</label>
                <select id="hi-a" name="aId" className="input" value={aId} onChange={(e) => { setAId(e.target.value); setVals({}); if (e.target.value === bId) setBId(accounts.find((a) => a.id !== e.target.value)?.id ?? ""); }}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="hi-b" className="label">Second account</label>
                <select id="hi-b" name="bId" className="input" value={bId} onChange={(e) => { setBId(e.target.value); setVals({}); }}>
                  {accounts.filter((a) => a.id !== aId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>

            {all.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">No pocket holds money in these two accounts.</p>
            ) : (
              <>
                <p className="text-xs text-slate-500">The box on each row is how much of that pocket is held in <strong>{nameOf(bId)}</strong>. The rest stays in {nameOf(aId)}.</p>
                {rows.map(([group, list]) => (
                  <fieldset key={group} className="space-y-1.5">
                    <legend className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{group}</legend>
                    {list.map((p) => {
                      const a = p.held[aId] ?? 0, b = p.held[bId] ?? 0;
                      return (
                        <div key={p.id} className="flex items-center gap-3">
                          <label htmlFor={`hi-p-${p.id}`} className="min-w-0 flex-1 text-sm">
                            <span className="block truncate">{p.name}</span>
                            <span className="nums block text-xs text-slate-500">{formatCents(a + b)} in all · now {formatCents(a)} in {nameOf(aId)}, {formatCents(b)} in {nameOf(bId)}</span>
                          </label>
                          <input id={`hi-p-${p.id}`} name={`held_${p.id}`} inputMode="decimal" aria-label={`Held in ${nameOf(bId)} for ${p.name}`} className="input nums w-28 text-right" value={vals[p.id] ?? centsToInput(b)} onChange={(e) => setVals((cur) => ({ ...cur, [p.id]: e.target.value }))} />
                        </div>
                      );
                    })}
                  </fieldset>
                ))}
              </>
            )}
            {state && !state.ok && <p role="alert" className="text-sm text-neg">{state.error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel <span className="kbd">Esc</span></button>
              <button type="submit" className="btn btn-primary" disabled={pending || all.length === 0}>{pending ? "Saving…" : "Save"}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
