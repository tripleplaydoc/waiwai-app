"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, Droplets, Pencil, Plus, ShieldPlus } from "lucide-react";
import { Modal } from "@/components/modal";
import { Hint } from "@/components/hint";
import { addCashPocketAction, assignWaterfallAction, combineTaxReserveAction, coverShortfallAction, saveWaterfallSettingsAction, splitTaxReserveAction, setOpexMonthsAheadAction, setupWaterfallAction } from "@/app/actions/cashflow";
import { formatCents } from "@/lib/utils/currency";
import type { FlowVM } from "@/lib/budget/flow-types";

const pct = (bps: number) => String(bps / 100);
const num = (t: string) => (t.trim() === "" ? NaN : Number(t.trim().replace(/%$/, "")));

/** The one Assign button: sends Ready to assign down the waterfall. */
export function AssignButton({ workspaceId, month, disabled }: { workspaceId: string; month: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button" className="btn btn-primary" disabled={pending || disabled}
        onClick={() => start(async () => { const r = await assignWaterfallAction(workspaceId, month); setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error }); })}
      >
        <ArrowDownToLine className="size-4" aria-hidden /> {pending ? "Assigning…" : "Assign"}
      </button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={`max-w-72 text-right text-[11px] leading-snug ${msg.ok ? "text-pos" : "text-neg"}`}>{msg.text}</span>}
    </div>
  );
}

function Bar({ value, tone }: { value: number; tone: "pos" | "warn" | "neg" }) {
  const color = { pos: "bg-pos", warn: "bg-warn", neg: "bg-neg" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="presentation">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </div>
  );
}

function Row({ title, sub, amount, of, ratio, tone }: { title: string; sub?: string; amount: number; of?: number; ratio?: number; tone?: "pos" | "warn" | "neg" }) {
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm font-semibold">{title}{sub && <span className="ml-1.5 text-[11px] font-normal text-slate-500">{sub}</span>}</span>
        <span className="nums shrink-0 text-sm font-bold">{formatCents(amount)}{of !== undefined && <span className="font-normal text-slate-500"> / {formatCents(of)}</span>}</span>
      </div>
      {ratio !== undefined && <div className="mt-1"><Bar value={ratio} tone={tone ?? (ratio >= 1 ? "pos" : "warn")} /></div>}
    </li>
  );
}

export function FlowPanel({ workspaceId, month, flow }: { workspaceId: string; month: string; flow: FlowVM }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [editing, setEditing] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => { const r = await fn(); setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error ?? "Something went wrong." }); });

  if (!flow.enabled) {
    return (
      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-1.5 font-bold">Cashflow waterfall <Hint label="What is the waterfall?">Money in the pool flows down in order: first the tax share, then OPEX (running costs), then Reservoir 1, then Reservoir 2 and Cash. Each step fills up before the next one gets any. Reservoirs are cash cushions that cover a few months of OPEX.</Hint></p>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          One <strong>Assign</strong> button sends the money in the pool down a chain: {pct(flow.taxBps)}% to taxes, the rest to OPEX, then Reservoir 1, then Reservoir 2 and Cash.
          This adds a Reserves category (Reservoir 1 &amp; 2) and a Cash category (Sinking Funds, Future Investments, Distributions) to your budget.
        </p>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => setupWaterfallAction(workspaceId))}>
          <Droplets className="size-4" aria-hidden /> {pending ? "Setting up…" : "Set up the waterfall"}
        </button>
        {msg && <p role="status" className={`text-xs ${msg.ok ? "text-pos" : "text-neg"}`}>{msg.text}</p>}
      </div>
    );
  }

  const { reservoir1: r1, reservoir2: r2, tax } = flow;
  const opexTarget = flow.opexBalanceCents + flow.opexNeedCents;
  return (
    <div className="text-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-bold">Cashflow waterfall <Hint label="What is the waterfall?">Money in the pool flows down in order: first the tax share, then OPEX (running costs), then Reservoir 1, then Reservoir 2 and Cash. Each step fills up before the next one gets any. Reservoirs are cash cushions that cover a few months of OPEX.</Hint></span>
        <button type="button" className="btn btn-sm" onClick={() => setEditing(true)} aria-label="Waterfall settings"><Pencil className="size-3.5" aria-hidden /> Settings</button>
      </div>
      <p className="mb-1 text-[11px] text-slate-500">Assign sends money: {pct(flow.taxBps)}% taxes · {pct(10000 - flow.taxBps)}% OPEX → Reservoir 1 → Reservoir 2 / Cash.</p>

      {flow.owedCents > 0 && (
        <p className="mb-1 rounded-lg bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
          Owed back to reserves: <strong className="nums">{formatCents(flow.owedCents)}</strong>. The next Assign pays this back first.
        </p>
      )}
      {flow.overspent.length > 0 && (
        <div className="mb-1 flex flex-wrap items-center gap-2 rounded-lg bg-neg-soft px-2.5 py-1.5 text-xs text-neg">
          <span className="min-w-0 flex-1">{flow.overspent.map((o) => `${o.name} ${formatCents(o.cents)} over`).join(" · ")}</span>
          <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => coverShortfallAction(workspaceId, month))}>
            <ShieldPlus className="size-3.5" aria-hidden /> {pending ? "Covering…" : "Cover from reserves"}
          </button>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mb-1 text-xs ${msg.ok ? "text-pos" : "text-neg"}`}>{msg.text}</p>}

      <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
        <Row title="Taxes" sub={`${pct(flow.taxBps)}% of each assign`} amount={tax?.balanceCents ?? 0} />
        {flow.taxSplit.map((t) => (
          <li key={t.id} className="flex justify-between gap-3 py-1 pl-4 text-xs text-slate-600 dark:text-slate-300"><span className="min-w-0 truncate">{t.accountName}</span><span className="nums shrink-0">{formatCents(Math.max(0, t.balanceCents))}</span></li>
        ))}
        <Row title="OPEX" sub={flow.monthlyOpexCents > 0 ? `${formatCents(flow.monthlyOpexCents)}/mo total` : "set monthly costs on its pockets"} amount={flow.opexBalanceCents} of={opexTarget > 0 ? opexTarget : undefined} ratio={opexTarget > 0 ? flow.opexBalanceCents / opexTarget : undefined} />
        {r1 && <Row title="Reservoir 1" sub={`${flow.reservoir1Months} mo of OPEX`} amount={r1.balanceCents} of={r1.targetCents} ratio={r1.targetCents > 0 ? r1.balanceCents / r1.targetCents : undefined} />}
        {r2 && <Row title="Reservoir 2" sub={`${flow.reservoir2Months} mo of OPEX`} amount={r2.balanceCents} of={r2.targetCents} ratio={r2.targetCents > 0 ? r2.balanceCents / r2.targetCents : undefined} />}
        <Row title="Cash" sub={`${pct(flow.cashPctBps)}% allocated`} amount={flow.cashBalanceCents} />
      </ul>
      <div className="mt-2 rounded-xl border border-[#E2E8F0] p-2.5 dark:border-slate-700">
        <p className="text-xs font-semibold">Tax reserve by account</p>
        <p className="mb-1.5 text-[11px] text-slate-500">{flow.taxSplit.length > 0 ? "Each cash account keeps its own tax pocket, filled from only that account's money in proportion to what it holds." : "Keep a separate tax pocket for each cash account, so every account shows how much of its balance is tax money."}</p>
        <button type="button" className="btn btn-sm min-h-11" disabled={pending} onClick={() => run(() => (flow.taxSplit.length > 0 ? combineTaxReserveAction(workspaceId, month) : splitTaxReserveAction(workspaceId, month)))}>
          {pending ? "Working…" : flow.taxSplit.length > 0 ? "Combine into one reserve" : "Split by account"}
        </button>
      </div>
      {flow.opexMonthlyCount > 0 && <OpexAhead workspaceId={workspaceId} flow={flow} />}
      {flow.cash.length > 0 && (
        <ul className="mt-1 space-y-0.5 pl-3 text-xs text-slate-600 dark:text-slate-300">
          {flow.cash.map((c) => (
            <li key={c.id} className="flex justify-between gap-3"><span>{c.name} <span className="text-slate-400">{pct(c.bps)}%</span></span><span className="nums">{formatCents(Math.max(0, c.balanceCents))}</span></li>
          ))}
        </ul>
      )}
      {editing && <SettingsDialog workspaceId={workspaceId} flow={flow} onClose={() => setEditing(false)} />}
    </div>
  );
}

function SettingsDialog({ workspaceId, flow, onClose }: { workspaceId: string; flow: FlowVM; onClose: () => void }) {
  const [tax, setTax] = useState(pct(flow.taxBps));
  const [m1, setM1] = useState(String(flow.reservoir1Months));
  const [m2, setM2] = useState(String(flow.reservoir2Months));
  const [share, setShare] = useState(pct(flow.reservoir2ShareBps));
  const [opexGroup, setOpexGroup] = useState(flow.opexGroupId ?? "");
  const [cash, setCash] = useState<Record<string, string>>(() => Object.fromEntries(flow.cash.map((c) => [c.id, pct(c.bps)])));
  const [newName, setNewName] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();

  const cashTotal = Object.values(cash).reduce((s, t) => s + (num(t) || 0), 0);
  const save = () => {
    const vals = [num(tax), num(m1), num(m2), num(share), ...Object.values(cash).map(num)];
    if (vals.some((n) => Number.isNaN(n))) { setErr("Fill in every number."); return; }
    start(async () => {
      const r = await saveWaterfallSettingsAction({
        workspaceId, enabled: true, taxPct: num(tax), reservoir1Months: num(m1), reservoir2Months: num(m2), reservoir2SharePct: num(share),
        opexGroupId: opexGroup || null, cash: Object.entries(cash).map(([id, t]) => ({ id, pct: num(t) })),
      });
      if (r.ok) onClose(); else setErr(r.error);
    });
  };
  const addPocket = () => start(async () => { const r = await addCashPocketAction(workspaceId, newName); if (r.ok) { setNewName(""); setErr(undefined); onClose(); } else setErr(r.error); });

  const field = "input nums w-full";
  return (
    <Modal open onClose={onClose} title="Waterfall settings">
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Taxes (% of each assign)</span><input className={field} inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} /></label>
          <label className="block"><span className="label">OPEX category</span>
            <select className="input w-full" value={opexGroup} onChange={(e) => setOpexGroup(e.target.value)}>
              <option value="">Choose…</option>
              {flow.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Reservoir 1 (months of OPEX)</span><input className={field} inputMode="decimal" value={m1} onChange={(e) => setM1(e.target.value)} /></label>
          <label className="block"><span className="label">Reservoir 2 (months of OPEX)</span><input className={field} inputMode="decimal" value={m2} onChange={(e) => setM2(e.target.value)} /></label>
          <label className="col-span-2 block"><span className="label">Share of overflow to Reservoir 2 (rest goes to Cash)</span><input className={field} inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} /></label>
        </div>
        <div>
          <p className="label">Cash split <span className={`nums ${cashTotal > 100 ? "text-neg" : "text-slate-500"}`}>({cashTotal}% of 100%)</span></p>
          <ul className="space-y-2">
            {flow.cash.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <input aria-label={`${c.name} percent`} className="input nums !w-24 text-right" inputMode="decimal" value={cash[c.id] ?? ""} onChange={(e) => setCash({ ...cash, [c.id]: e.target.value })} />
                <span className="text-slate-500">%</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input className="input flex-1" placeholder="New cash pocket (e.g. Vacation)" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button type="button" className="btn" disabled={pending || !newName.trim()} onClick={addPocket}><Plus className="size-4" aria-hidden /> Add</button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Whatever percentage isn&apos;t given to a pocket stays in the pool.</p>
        </div>
        {err && <p role="alert" className="text-xs text-neg">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}

/** One choice that sets Months ahead on every monthly-cost pocket in the OPEX category. */
function OpexAhead({ workspaceId, flow }: { workspaceId: string; flow: FlowVM }) {
  const current = flow.opexMonthsAhead;
  const [value, setValue] = useState(String(current ?? 0));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const router = useRouter();
  const unchanged = current !== null && Number(value) === current;
  return (
    <div className="mt-2 rounded-xl border border-[#E2E8F0] p-2.5 dark:border-slate-700">
      <p className="text-xs font-semibold">OPEX months ahead <span className="font-normal text-slate-500">({flow.opexMonthlyCount} monthly cost{flow.opexMonthlyCount === 1 ? "" : "s"})</span></p>
      <p className="mb-1.5 text-[11px] text-slate-500">Keep extra months of each cost on hand beyond this month.{current === null && " They are set differently right now."}</p>
      <div className="flex gap-2">
        <select aria-label="OPEX months ahead" className="input !min-h-10 flex-1" value={value} onChange={(e) => { setValue(e.target.value); setMsg(undefined); }}>
          <option value="0">This month only</option>
          {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} month{n === 1 ? "" : "s"} ahead</option>)}
        </select>
        <button type="button" className="btn btn-primary" disabled={pending || unchanged}
          onClick={() => start(async () => { const r = await setOpexMonthsAheadAction(workspaceId, Number(value)); setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Done." : r.error }); if (r.ok) router.refresh(); })}>
          {pending ? "Applying…" : "Apply to all"}
        </button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-1 text-xs ${msg.ok ? "text-pos" : "text-neg"}`}>{msg.text}</p>}
    </div>
  );
}
