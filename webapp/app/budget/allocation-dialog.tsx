"use client";

import { useMemo, useState, useTransition } from "react";
import { Percent } from "lucide-react";
import { Modal } from "@/components/modal";
import { applyAllocationAction, saveAllocationAction } from "@/app/actions/pockets";
import { formatCents, parseToCents } from "@/lib/utils/currency";
import { planAllocation, type AllocGroup } from "@/lib/budget/allocation";
import type { GroupVM } from "@/lib/budget/board-types";

const bpsToText = (bps: number | null) => (bps === null ? "" : String(bps / 100));

/** "12.5" -> 1250; "" -> null; invalid -> undefined */
function textToBps(t: string): number | null | undefined {
  const v = t.trim().replace(/%$/, "");
  if (v === "") return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(v)) return undefined;
  const bps = Math.round(parseFloat(v) * 100);
  return bps > 10000 ? undefined : bps;
}

export function AllocationButton({ workspaceId, month, groups, readyToAssignCents }: {
  workspaceId: string; month: string; groups: GroupVM[]; readyToAssignCents: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Percent className="size-4" aria-hidden /> Assign by %
      </button>
      {open && <AllocationDialog onClose={() => setOpen(false)} workspaceId={workspaceId} month={month} groups={groups} readyToAssignCents={readyToAssignCents} />}
    </>
  );
}

function AllocationDialog({ onClose, workspaceId, month, groups, readyToAssignCents }: {
  onClose: () => void; workspaceId: string; month: string; groups: GroupVM[]; readyToAssignCents: number;
}) {
  const usable = useMemo(
    () => groups.filter((g) => g.id !== "__none").map((g) => ({ ...g, pockets: g.pockets.filter((p) => !p.isSystemManaged) })),
    [groups]
  );
  const [gText, setGText] = useState<Record<string, string>>(() => Object.fromEntries(usable.map((g) => [g.id, bpsToText(g.allocationBps)])));
  const [pText, setPText] = useState<Record<string, string>>(() =>
    Object.fromEntries(usable.flatMap((g) => g.pockets.map((p) => [p.id, bpsToText(p.allocationBps)])))
  );
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, start] = useTransition();

  const rta = Math.max(0, readyToAssignCents);
  const typed = amount.trim() === "" ? null : parseToCents(amount);
  const pool = typed === null ? rta : Math.min(typed, rta);
  const amountInvalid = amount.trim() !== "" && (typed === null || typed <= 0 || typed > rta);

  const parsed = useMemo(() => {
    let invalid = false;
    const groupsB = usable.map((g) => {
      const gb = textToBps(gText[g.id] ?? "");
      if (gb === undefined) invalid = true;
      return {
        id: g.id, bps: gb ?? null,
        pockets: g.pockets.map((p) => {
          const pb = textToBps(pText[p.id] ?? "");
          if (pb === undefined) invalid = true;
          return { id: p.id, bps: pb ?? null };
        }),
      } satisfies AllocGroup;
    });
    return { invalid, groupsB };
  }, [usable, gText, pText]);

  const gTotal = parsed.groupsB.reduce((s, g) => s + (g.bps ?? 0), 0);
  const overGroups = gTotal > 10000;
  const overPockets = parsed.groupsB.some((g) => g.pockets.reduce((s, p) => s + (p.bps ?? 0), 0) > 10000);
  const plan = useMemo(() => planAllocation(pool, parsed.groupsB), [pool, parsed.groupsB]);
  const cents = new Map(plan.pockets.map((p) => [p.id, p.cents]));
  const gShare = new Map(plan.groupShares.map((g) => [g.id, g.cents]));
  const blocked = parsed.invalid || overGroups || overPockets;

  function payload() {
    return JSON.stringify({
      groups: parsed.groupsB.map((g) => ({ id: g.id, bps: g.bps })),
      pockets: parsed.groupsB.flatMap((g) => g.pockets.map((p) => ({ id: p.id, bps: p.bps }))),
    });
  }

  function save(thenAssign: boolean) {
    setMessage(undefined);
    start(async () => {
      const r = await saveAllocationAction(workspaceId, payload());
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      if (!thenAssign) return setMessage({ ok: true, text: "Percentages saved." });
      const a = await applyAllocationAction(workspaceId, month, amount);
      if (!a.ok) return setMessage({ ok: false, text: a.error });
      onClose();
    });
  }

  return (
    <Modal open onClose={onClose} title="Assign money by percentages" wide>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Give each <strong>category</strong> a share of your money, then split that share between its <strong>pockets</strong>.
          Anything you don&apos;t allocate stays in the pool.
        </p>

        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
          <div className="min-w-48 flex-1">
            <label htmlFor="al-amount" className="label">Amount to split</label>
            <input id="al-amount" inputMode="decimal" className={`input nums ${amountInvalid ? "!border-[#C9372C]" : ""}`} placeholder={`All of the money in pool (${formatCents(rta)})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500 dark:text-slate-400">Splitting</div>
            <div className="nums text-xl font-semibold text-[#2E7D32] dark:text-[#6FCF76]">{formatCents(pool)}</div>
          </div>
        </div>

        <div className="max-h-[48vh] space-y-3 overflow-y-auto pr-1">
          {usable.map((g) => {
            const pTotal = g.pockets.reduce((s, p) => s + (textToBps(pText[p.id] ?? "") ?? 0), 0);
            return (
              <section key={g.id} className="rounded-xl border border-[#E2E8F0] dark:border-slate-700">
                <div className="flex items-center gap-3 bg-slate-50 px-4 py-2.5 dark:bg-slate-800/60">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{g.name}</h3>
                  <span className="nums text-xs text-slate-500">{formatCents(gShare.get(g.id) ?? 0)}</span>
                  <PercentInput label={`${g.name} share of your money`} value={gText[g.id] ?? ""} onChange={(v) => setGText((s) => ({ ...s, [g.id]: v }))} />
                </div>
                {g.pockets.length === 0 ? (
                  <p className="px-4 py-2.5 text-xs text-slate-500">No pockets yet.</p>
                ) : (
                  <ul>
                    {g.pockets.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 border-t border-[#E2E8F0] px-4 py-2 dark:border-slate-800">
                        <span className="min-w-0 flex-1 truncate pl-3 text-sm">{p.name}</span>
                        <span className="nums text-xs text-slate-500">{formatCents(cents.get(p.id) ?? 0)}</span>
                        <PercentInput label={`${p.name} share of ${g.name}`} value={pText[p.id] ?? ""} onChange={(v) => setPText((s) => ({ ...s, [p.id]: v }))} />
                      </li>
                    ))}
                    <li className={`border-t border-[#E2E8F0] px-4 py-1.5 text-right text-[11px] dark:border-slate-800 ${pTotal > 10000 ? "font-semibold text-[#C9372C]" : "text-slate-500"}`}>
                      Pockets use {(pTotal / 100).toFixed(2).replace(/\.00$/, "")}% of this category {pTotal > 10000 ? "— over 100%" : ""}
                    </li>
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={overGroups ? "font-semibold text-[#C9372C]" : "text-slate-600 dark:text-slate-300"}>
            Categories use {(gTotal / 100).toFixed(2).replace(/\.00$/, "")}%{overGroups ? " — over 100%" : ` · ${((10000 - gTotal) / 100).toFixed(2).replace(/\.00$/, "")}% stays unassigned`}
          </span>
          <span className="nums ml-auto text-slate-500">Will assign {formatCents(plan.allocatedCents)}</span>
        </div>

        {parsed.invalid && <p role="alert" className="text-sm text-[#C9372C]">Use percentages like 25 or 12.5 (up to two decimals).</p>}
        {message && <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-[#2E7D32]" : "text-[#C9372C]"}`}>{message.text}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Close <span className="kbd">Esc</span></button>
          <button type="button" className="btn" disabled={pending || blocked} onClick={() => save(false)}>Save percentages</button>
          <button type="button" className="btn btn-primary" disabled={pending || blocked || amountInvalid || plan.allocatedCents <= 0} onClick={() => save(true)}>
            {pending ? "Working…" : `Save & assign ${formatCents(plan.allocatedCents)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PercentInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <span className="relative inline-block w-24 shrink-0">
      <input
        aria-label={label} inputMode="decimal" value={value} placeholder="0"
        onChange={(e) => onChange(e.target.value)} onFocus={(e) => e.currentTarget.select()}
        className="input nums !min-h-10 pr-7 text-right"
      />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">%</span>
    </span>
  );
}
