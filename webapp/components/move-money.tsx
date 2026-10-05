"use client";

import { useState, useTransition } from "react";
import { assignMoreAction, moveMoneyAction, releaseToReadyAction } from "@/app/actions/pockets";
import { centsToInput, formatCents, parseToCents } from "@/lib/utils/currency";

const READY = "__ready__";
export interface MovePocket { id: string; name: string; group: string; availableCents: number; assignedCents?: number; /** What it still takes to cover this pocket (its target for the month, or an overspend). 0 = covered. */ needCents?: number }

/** Shared "move money between pockets" form (used from the + button and the budget page). */
export function MoveForm({ workspaceId, month, pockets, initialFromId, onDone, onCancel }: {
  workspaceId: string; month: string; pockets: MovePocket[]; initialFromId?: string; onDone: () => void; onCancel: () => void;
}) {
  const firstFrom = initialFromId && pockets.some((p) => p.id === initialFromId) ? initialFromId : pockets.find((p) => p.availableCents > 0)?.id ?? pockets[0]?.id ?? "";
  const [fromId, setFromId] = useState(firstFrom);
  const [toId, setToId] = useState(READY);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const from = pockets.find((p) => p.id === fromId);
  const groups = [...new Set(pockets.map((p) => p.group))];


  const options = (skip?: string) => groups.map((g) => (
    <optgroup key={g} label={g}>
      {pockets.filter((p) => p.group === g && p.id !== skip).map((p) => <option key={p.id} value={p.id}>{p.name} — {formatCents(p.availableCents)}</option>)}
    </optgroup>
  ));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        start(async () => {
          const r = toId === READY ? await releaseToReadyAction(workspaceId, fromId, month, amount) : await moveMoneyAction(workspaceId, fromId, toId, month, amount);
          if (r.ok) onDone(); else setError(r.error);
        });
      }}
    >
      <div>
        <label htmlFor="mv-from" className="label">Move from</label>
        <select id="mv-from" data-autofocus className="input" value={fromId} onChange={(e) => { setFromId(e.target.value); if (e.target.value === toId) setToId(""); }}>{options()}</select>
      </div>
      <div>
        <label htmlFor="mv-to" className="label">Move to</label>
        <select id="mv-to" className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
          <option value={READY}>↩ Money in pool</option>
          {options(fromId)}
        </select>
      </div>
      <div>
        <label htmlFor="mv-amount" className="label">Amount</label>
        <div className="flex gap-2">
          <input id="mv-amount" required inputMode="decimal" placeholder="0.00" className="input nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button type="button" className="btn shrink-0" disabled={!from || from.availableCents <= 0} onClick={() => from && setAmount(centsToInput(from.availableCents))}>All</button>
        </div>
        {from && <p className="mt-1 text-xs text-slate-500">{from.name} has <span className="nums font-medium">{formatCents(from.availableCents)}</span> available.</p>}
      </div>
      {error && <p role="alert" className="text-sm text-neg">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn" onClick={onCancel}>Cancel <span className="kbd">Esc</span></button>
        <button type="submit" className="btn btn-primary" disabled={pending || !toId}>{pending ? "Moving…" : toId === READY ? "Move to the pool" : "Move money"}</button>
      </div>
    </form>
  );
}

/** Add money to a pocket's assigned amount, taken from Ready to Assign. */
export interface FundingAccount { id: string; name: string; readyCents: number; stewardName?: string | null }

export function AddForm({ workspaceId, month, pockets, readyToAssignCents, initialId, accounts = [], initialAccountId = null, onDone, onCancel }: {
  workspaceId: string; month: string; pockets: MovePocket[]; readyToAssignCents: number; initialId?: string; onDone: () => void; onCancel: () => void;
  /** Bank accounts with ready cash; the money added is tagged to the one chosen ("" = best match). */
  accounts?: FundingAccount[]; initialAccountId?: string | null;
}) {
  const [acctId, setAcctId] = useState(initialAccountId && accounts.some((a) => a.id === initialAccountId) ? initialAccountId : "");
  const [id, setId] = useState(initialId && pockets.some((p) => p.id === initialId) ? initialId : pockets[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const pocket = pockets.find((p) => p.id === id);
  const groups = [...new Set(pockets.map((p) => p.group))];
  const cents = parseToCents(amount);
  const adding = cents !== null && cents > 0 ? cents : 0;
  const chosen = accounts.find((a) => a.id === acctId);
  const ready = Math.max(0, chosen ? chosen.readyCents : readyToAssignCents);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        start(async () => {
          const r = await assignMoreAction(workspaceId, id, month, amount, acctId || undefined);
          if (r.ok) onDone(); else setError(r.error);
        });
      }}
    >
      <div className="rounded-xl bg-pos-soft px-3 py-2 text-sm">
        <span className="text-slate-600 dark:text-slate-300">Money in pool{chosen ? ` in ${chosen.name}` : ""}</span>{" "}
        <span className="nums font-bold text-pos">{formatCents(chosen ? chosen.readyCents : readyToAssignCents)}</span>
      </div>
      {initialId && pocket ? (
        <p className="text-base font-bold">{pocket.name}</p>
      ) : (
        <div>
          <label htmlFor="add-pocket" className="label">Add to</label>
          <select id="add-pocket" className="input" value={id} onChange={(e) => setId(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g} label={g}>{pockets.filter((p) => p.group === g).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
            ))}
          </select>
        </div>
      )}
      {accounts.length > 1 && (
        <div>
          <label htmlFor="add-acct" className="label">From which account?</label>
          <select id="add-acct" className="input" value={acctId} onChange={(e) => setAcctId(e.target.value)}>
            <option value="">Any account ({formatCents(readyToAssignCents)} free)</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.stewardName ? ` (${a.stewardName})` : ""} — {formatCents(a.readyCents)} free</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="add-amount" className="label">Amount to add</label>
        <div className="flex gap-2">
          <input id="add-amount" data-autofocus required inputMode="decimal" placeholder="0.00" className="input nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button type="button" className="btn shrink-0" disabled={ready <= 0} onClick={() => setAmount(centsToInput(ready))}>All ready</button>
        </div>
        {pocket && (
          <p className="nums mt-1 text-xs text-slate-500">
            {pocket.name}: assigned {formatCents(pocket.assignedCents ?? 0)}
            {adding > 0 && <> → <strong className="text-slate-800 dark:text-slate-100">{formatCents((pocket.assignedCents ?? 0) + adding)}</strong></>}
            {" · "}available {formatCents(pocket.availableCents)}{adding > 0 && <> → <strong className="text-slate-800 dark:text-slate-100">{formatCents(pocket.availableCents + adding)}</strong></>}
          </p>
        )}
        {pocket && (pocket.needCents ?? 0) > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2">
            <p className="nums min-w-0 flex-1 text-xs text-warn">
              Needs <strong>{formatCents(pocket.needCents!)}</strong> more to be covered
              {ready < pocket.needCents! && <> · only {formatCents(ready)} in the pool</>}
            </p>
            <button type="button" className="btn btn-sm shrink-0" disabled={ready <= 0} onClick={() => setAmount(centsToInput(Math.min(pocket.needCents!, ready)))}>
              {ready < pocket.needCents! ? "Use what's there" : "Fill what's needed"}
            </button>
          </div>
        )}
        {pocket && pocket.needCents === 0 && <p className="mt-2 text-xs font-medium text-pos">Already covered ✓</p>}
        {adding > ready && <p className="mt-1 text-xs text-warn">That&apos;s more than the {formatCents(ready)} in the pool.</p>}
      </div>
      {error && <p role="alert" className="text-sm text-neg">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn" onClick={onCancel}>Cancel <span className="kbd">Esc</span></button>
        <button type="submit" className="btn btn-primary" disabled={pending || !id || ready <= 0}>{pending ? "Adding…" : "Add money"}</button>
      </div>
    </form>
  );
}
