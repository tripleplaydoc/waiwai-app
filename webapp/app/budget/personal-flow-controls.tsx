"use client";

import { useState, useTransition } from "react";
import { ArrowDownToLine, Droplets, Pencil } from "lucide-react";
import { Modal } from "@/components/modal";
import { assignPersonalFlowAction, savePersonalFlowSettingsAction, setupPersonalFlowAction } from "@/app/actions/personal-flow";
import { formatCents } from "@/lib/utils/currency";
import type { PersonalFlowVM } from "@/lib/budget/personal-flow-types";

const pct = (bps: number) => String(bps / 100);
const num = (t: string) => (t.trim() === "" ? NaN : Number(t.trim().replace(/%$/, "")));

/** The one Assign button on the Personal side. */
export function PersonalAssignButton({ workspaceId, month, disabled }: { workspaceId: string; month: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button" className="btn btn-primary" disabled={pending || disabled}
        onClick={() => start(async () => { const r = await assignPersonalFlowAction(workspaceId, month); setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error }); })}
      >
        <ArrowDownToLine className="size-4" aria-hidden /> {pending ? "Assigning…" : "Assign"}
      </button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={`max-w-72 text-right text-[11px] leading-snug ${msg.ok ? "text-pos" : "text-neg"}`}>{msg.text}</span>}
    </div>
  );
}

export function PersonalFlowPanel({ workspaceId, flow }: { workspaceId: string; flow: PersonalFlowVM }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [editing, setEditing] = useState(false);

  if (!flow.enabled) {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-bold">Give · Save · Live</p>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          One <strong>Assign</strong> button splits the money in the pool into Give 20%, Save 10% and Live 70% (you can change every percentage).
          This adds a Give, a Save and a Live category to your budget.
        </p>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const r = await setupPersonalFlowAction(workspaceId); setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error }); })}>
          <Droplets className="size-4" aria-hidden /> {pending ? "Setting up…" : "Set up Give / Save / Live"}
        </button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-pos" : "text-neg"}`}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <div className="text-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-bold">Give · Save · Live</span>
        <button type="button" className="btn btn-sm" onClick={() => setEditing(true)} aria-label="Give Save Live settings"><Pencil className="size-3.5" aria-hidden /> Settings</button>
      </div>
      <p className="mb-1 text-[11px] text-slate-500">Assign sends money: {flow.buckets.map((b) => `${pct(b.bps)}% ${b.label}`).join(" · ")}.</p>
      <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
        {flow.buckets.map((b) => {
          const target = b.balanceCents + b.needCents;
          return (
            <li key={b.key} className="py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm font-semibold">{b.label}<span className="ml-1.5 text-[11px] font-normal text-slate-500">{pct(b.bps)}%{b.groupNames.length ? ` · ${b.groupNames.join(", ")}` : ""}</span></span>
                <span className="nums shrink-0 text-sm font-bold">{formatCents(b.balanceCents)}{b.needCents > 0 && <span className="font-normal text-slate-500"> / {formatCents(target)}</span>}</span>
              </div>
              {target > 0 && b.needCents > 0 && (
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="presentation">
                  <div className="h-full rounded-full bg-warn" style={{ width: `${Math.round(Math.min(1, b.balanceCents / target) * 100)}%` }} />
                </div>
              )}
              {b.pockets.length === 0 && <p className="mt-0.5 text-[11px] text-neg">No pockets yet — add one to this category.</p>}
            </li>
          );
        })}
      </ul>
      {editing && <SettingsDialog workspaceId={workspaceId} flow={flow} onClose={() => setEditing(false)} />}
    </div>
  );
}

function SettingsDialog({ workspaceId, flow, onClose }: { workspaceId: string; flow: PersonalFlowVM; onClose: () => void }) {
  const [p, setP] = useState<Record<string, string>>(() => Object.fromEntries(flow.buckets.map((b) => [b.key, pct(b.bps)])));
  const [g, setG] = useState<Record<string, string[]>>(() => Object.fromEntries(flow.buckets.map((b) => [b.key, b.groupIds])));
  const [sh, setSh] = useState<Record<string, string>>(() => Object.fromEntries(flow.buckets.flatMap((b) => b.pockets.map((k) => [k.id, pct(k.shareBps)]))));
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();

  const total = Math.round(flow.buckets.reduce((s, b) => s + (num(p[b.key]) || 0), 0) * 100) / 100;
  const save = () => {
    const vals = [...flow.buckets.map((b) => num(p[b.key])), ...Object.values(sh).map(num)];
    if (vals.some((n) => Number.isNaN(n))) { setErr("Fill in every number."); return; }
    start(async () => {
      const r = await savePersonalFlowSettingsAction({
        workspaceId, givePct: num(p.GIVE), savePct: num(p.SAVE), livePct: num(p.LIVE),
        giveGroupIds: g.GIVE, saveGroupIds: g.SAVE, liveGroupIds: g.LIVE,
        shares: Object.entries(sh).map(([id, t]) => ({ id, pct: num(t) })),
      });
      if (r.ok) onClose(); else setErr(r.error);
    });
  };

  return (
    <Modal open onClose={onClose} title="Give · Save · Live settings">
      <div className="space-y-4 text-sm">
        <p className={`nums text-xs ${total === 100 ? "text-slate-500" : "text-neg"}`}>Total {total}% — must be 100%.</p>
        {flow.buckets.map((b) => (
          <section key={b.key} className="space-y-2 rounded-xl border border-[#E2E8F0] p-3 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span className="flex-1 font-semibold">{b.label}</span>
              <input aria-label={`${b.label} percent`} className="input nums !w-24 text-right" inputMode="decimal" value={p[b.key]} onChange={(e) => setP({ ...p, [b.key]: e.target.value })} />
              <span className="text-slate-500">%</span>
            </div>
            <fieldset>
              <legend className="label">Pays into these categories</legend>
              <div className="flex flex-wrap gap-1.5">
                {flow.groups.map((x) => {
                  const here = g[b.key].includes(x.id);
                  const elsewhere = !here && Object.entries(g).some(([k, ids]) => k !== b.key && ids.includes(x.id));
                  return (
                    <label key={x.id} className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs ${here ? "border-[#2E6BE6] bg-[#2E6BE6]/10 font-semibold text-[#2E6BE6]" : "border-[#E2E8F0] dark:border-slate-700"} ${elsewhere ? "opacity-40" : ""}`}>
                      <input
                        type="checkbox" className="sr-only" checked={here} disabled={elsewhere}
                        onChange={(e) => setG({ ...g, [b.key]: e.target.checked ? [...g[b.key], x.id] : g[b.key].filter((id) => id !== x.id) })}
                      />
                      {x.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {b.pockets.length > 0 && b.groupIds.join() === g[b.key].join() && (
              <div>
                <p className="label">Share of what&apos;s left after monthly costs and goals are met</p>
                <ul className="space-y-1.5">
                  {b.pockets.map((k) => (
                    <li key={k.id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-xs">{k.name}</span>
                      <input aria-label={`${k.name} share`} className="input nums !w-20 text-right" inputMode="decimal" value={sh[k.id] ?? ""} onChange={(e) => setSh({ ...sh, [k.id]: e.target.value })} />
                      <span className="text-slate-500">%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
        {err && <p role="alert" className="text-xs text-neg">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
