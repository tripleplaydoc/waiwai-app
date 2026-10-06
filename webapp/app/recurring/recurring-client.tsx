"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Pause, Play, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { deleteRecurringAction, postAllRecurringAction, postRecurringAction, saveRecurringAction, setRecurringActiveAction, skipRecurringAction } from "@/app/actions/recurring";
import { FREQUENCIES, type Frequency } from "@/lib/recurring-math";
import { centsToInput, formatCents } from "@/lib/utils/currency";
import type { RecurringVM, Suggestion } from "@/lib/recurring";

interface Pocket { id: string; name: string; group: string; income: boolean }
const freqLabel = (f: Frequency) => FREQUENCIES.find((x) => x.value === f)?.label ?? f;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (iso: string) => `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;

interface Draft { id?: string; payee: string; amount: string; direction: "outflow" | "inflow"; frequency: Frequency; startDate: string; endDate: string; accountId: string; categoryId: string; memo: string; autoPost: boolean; deductible: boolean }

function PocketOptions({ pockets, income }: { pockets: Pocket[]; income: boolean }) {
  const list = pockets.filter((p) => p.income === income || !income);
  const groups = [...new Set(list.map((p) => p.group))];
  return <>{groups.map((g) => <optgroup key={g} label={g}>{list.filter((p) => p.group === g).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}</>;
}

function Form({ draft, accounts, pockets, isBusiness, onClose }: { draft: Draft; accounts: { id: string; name: string }[]; pockets: Pocket[]; isBusiness: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState(saveRecurringAction, undefined);
  const [dir, setDir] = useState(draft.direction);
  const router = useRouter();
  useEffect(() => { if (state?.ok) { router.refresh(); onClose(); } }, [state, router, onClose]);
  return (
    <form action={action} className="space-y-3">
      {draft.id && <input type="hidden" name="id" value={draft.id} />}
      <fieldset className="flex gap-2" aria-label="Direction">
        {(["outflow", "inflow"] as const).map((d) => (
          <label key={d} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-4 text-sm font-medium ${dir === d ? (d === "outflow" ? "border-[#C9372C] bg-neg-soft text-neg" : "border-[#2E7D32] bg-pos-soft text-pos") : "border-[#E2E8F0] dark:border-slate-700"}`}>
            <input type="radio" name="direction" value={d} checked={dir === d} onChange={() => setDir(d)} className="sr-only" />{d === "outflow" ? "Money out" : "Money in"}
          </label>
        ))}
      </fieldset>
      <div><label htmlFor="rc-payee" className="label">Who</label><input id="rc-payee" name="payee" required maxLength={200} defaultValue={draft.payee} className="input" placeholder="Netflix, paycheck, Chase Auto…" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="rc-amt" className="label">Amount</label><input id="rc-amt" name="amount" required inputMode="decimal" defaultValue={draft.amount} className="input nums" placeholder="0.00" /></div>
        <div><label htmlFor="rc-freq" className="label">How often</label><select id="rc-freq" name="frequency" defaultValue={draft.frequency} className="input">{FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="rc-next" className="label">Next date</label><input id="rc-next" name="startDate" type="date" required defaultValue={draft.startDate} className="input" /></div>
        <div><label htmlFor="rc-end" className="label">Ends (optional)</label><input id="rc-end" name="endDate" type="date" defaultValue={draft.endDate} className="input" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="rc-acct" className="label">Account</label><select id="rc-acct" name="accountId" defaultValue={draft.accountId || accounts[0]?.id} className="input">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div><label htmlFor="rc-cat" className="label">Pocket</label><select id="rc-cat" name="categoryId" defaultValue={draft.categoryId} className="input"><option value="">Uncategorized (decide later)</option><PocketOptions pockets={pockets} income={dir === "inflow"} /></select></div>
      </div>
      <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" name="autoPost" defaultChecked={draft.autoPost} className="mt-1 size-5" /><span><strong>Post it automatically</strong><span className="block text-xs text-slate-500">Off: it waits for you to tap Post when it comes due. Best for amounts that change (utilities, paychecks).</span></span></label>
      {isBusiness && dir === "outflow" && <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="deductible" defaultChecked={draft.deductible} className="size-5" /> Tax-deductible</label>}
      <div><label htmlFor="rc-memo" className="label">Memo (optional)</label><input id="rc-memo" name="memo" maxLength={500} defaultValue={draft.memo} className="input" /></div>
      {state && !state.ok && <p role="alert" className="text-sm text-neg">{state.error}</p>}
      <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 bg-white px-1 pb-1 pt-2 dark:bg-slate-900"><button type="button" className="btn" onClick={onClose}>Cancel <span className="kbd">Esc</span></button><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button></div>
    </form>
  );
}

export function RecurringClient({ workspaceId, today, items, suggestions, accounts, pockets, isBusiness }: { workspaceId: string; today: string; items: RecurringVM[]; suggestions: Suggestion[]; accounts: { id: string; name: string }[]; pockets: Pocket[]; isBusiness: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => { const r = await fn(); setMsg(r.ok ? r.message : r.error); router.refresh(); });
  const due = items.filter((i) => i.isActive && i.dueDates.length > 0);
  const blank = (): Draft => ({ payee: "", amount: "", direction: "outflow", frequency: "MONTHLY", startDate: today, endDate: "", accountId: accounts[0]?.id ?? "", categoryId: "", memo: "", autoPost: false, deductible: false });
  const fromItem = (i: RecurringVM): Draft => ({ id: i.id, payee: i.payee, amount: centsToInput(Math.abs(i.amountCents)), direction: i.amountCents < 0 ? "outflow" : "inflow", frequency: i.frequency, startDate: i.nextDate, endDate: i.endDate ?? "", accountId: i.accountId, categoryId: i.categoryId ?? "", memo: i.memo ?? "", autoPost: i.autoPost, deductible: i.isDeductible });
  const fromSuggestion = (s: Suggestion): Draft => ({ ...blank(), payee: s.payee, amount: centsToInput(s.amountCents), frequency: s.frequency, startDate: s.nextDate, accountId: s.accountId, categoryId: s.categoryId ?? "" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={accounts.length === 0} onClick={() => setDraft(blank())}><Plus className="size-4" aria-hidden /> Add recurring</button>
        {msg && <span role="status" className="text-sm text-slate-600 dark:text-slate-300">{msg}</span>}
      </div>
      {accounts.length === 0 && <div className="card p-4 text-sm">Add an account first, then set up what repeats.</div>}

      {due.length > 0 && (
        <section className="card overflow-hidden border-amber-300 dark:border-amber-700" aria-labelledby="rc-due">
          <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] bg-warn-soft px-4 py-2 dark:border-slate-800">
            <h2 id="rc-due" className="text-xs font-bold uppercase tracking-wider text-warn">Due now · {due.length}</h2>
            <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => postAllRecurringAction(workspaceId))}>Post all</button>
          </div>
          <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
            {due.map((i) => (
              <li key={i.id} className="space-y-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold">{i.payee}</p>
                  <p className={`nums font-semibold ${i.amountCents < 0 ? "" : "text-pos"}`}>{formatCents(i.amountCents * i.dueDates.length)}</p>
                </div>
                <p className="text-xs text-slate-500">{i.dueDates.length === 1 ? `Due ${nice(i.dueDates[0])}` : `${i.dueDates.length} missed: ${i.dueDates.map(nice).join(", ")}`} · {i.accountName}</p>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => postRecurringAction(i.id))}>Post</button>
                  <button type="button" className="btn btn-sm" disabled={pending} onClick={() => setDraft(fromItem(i))}>Change amount</button>
                  <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => skipRecurringAction(i.id))}>Skip</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card overflow-hidden" aria-labelledby="rc-all">
        <h2 id="rc-all" className="border-b border-[#E2E8F0] bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">Everything that repeats</h2>
        {items.length === 0 ? (
          <p className="p-4 text-sm text-slate-600 dark:text-slate-300">Nothing yet. Add a subscription, a bill or a paycheck, or pick from the suggestions below.</p>
        ) : (
          <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
            {items.map((i) => <Row key={i.id} i={i} pending={pending} onEdit={() => setDraft(fromItem(i))} run={run} />)}
          </ul>
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="card overflow-hidden" aria-labelledby="rc-sug">
          <h2 id="rc-sug" className="border-b border-[#E2E8F0] bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">Looks like these repeat</h2>
          <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
            {suggestions.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0"><p className="truncate font-semibold">{s.payee}</p><p className="nums text-xs text-slate-500">{formatCents(s.amountCents)} · {freqLabel(s.frequency).toLowerCase()} · seen {s.count} times · next {nice(s.nextDate)}</p></div>
                <button type="button" className="btn btn-sm shrink-0" onClick={() => setDraft(fromSuggestion(s))}>Set up</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Edit recurring" : "Add recurring"}>
        {draft && <Form key={draft.id ?? draft.payee} draft={draft} accounts={accounts} pockets={pockets} isBusiness={isBusiness} onClose={() => setDraft(null)} />}
      </Modal>
    </div>
  );
}

function Row({ i, pending, onEdit, run }: { i: RecurringVM; pending: boolean; onEdit: () => void; run: (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => void }) {
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${i.isActive ? "" : "opacity-60"}`}>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p className="flex items-baseline justify-between gap-3"><span className="truncate font-semibold">{i.payee}</span><span className={`nums shrink-0 font-semibold ${i.amountCents > 0 ? "text-pos" : ""}`}>{formatCents(i.amountCents)}</span></p>
        <p className="flex items-center gap-1 text-xs text-slate-500"><CalendarClock className="size-3.5 shrink-0" aria-hidden /> {freqLabel(i.frequency)} · next {nice(i.nextDate)} · {i.accountName}{i.categoryName ? ` · ${i.categoryName}` : ""} · {i.autoPost ? "posts itself" : "asks first"}{i.isActive ? "" : " · paused"}</p>
      </button>
      <button type="button" className="btn size-10 !px-0" aria-label={i.isActive ? `Pause ${i.payee}` : `Resume ${i.payee}`} disabled={pending} onClick={() => run(() => setRecurringActiveAction(i.id, !i.isActive))}>{i.isActive ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}</button>
      <button type="button" className="btn size-10 !px-0" aria-label={`Delete ${i.payee}`} disabled={pending} onClick={() => { if (window.confirm(`Stop and remove ${i.payee}? Past transactions stay.`)) run(() => deleteRecurringAction(i.id)); }}><Trash2 className="size-4" aria-hidden /></button>
    </li>
  );
}
