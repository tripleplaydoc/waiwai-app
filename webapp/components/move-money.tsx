"use client";

import { useState, useTransition } from "react";
import { assignMoreAction, moveMoneyAction } from "@/app/actions/pockets";
import { retagPocketAction } from "@/app/actions/funding";
import { centsToInput, formatCents, parseToCents } from "@/lib/utils/currency";

export interface MovePocket { id: string; name: string; group: string; availableCents: number; assignedCents?: number }

/** Shared "move money between pockets" form (used from the + button and the budget page). */
export function MoveForm({ workspaceId, month, pockets, initialFromId, onDone, onCancel }: {
  workspaceId: string; month: string; pockets: MovePocket[]; initialFromId?: string; onDone: () => void; onCancel: () => void;
}) {
  const firstFrom = initialFromId && pockets.some((p) => p.id === initialFromId) ? initialFromId : pockets.find((p) => p.availableCents > 0)?.id ?? pockets[0]?.id ?? "";
  const [fromId, setFromId] = useState(firstFrom);
  const [toId, setToId] = useState(pockets.find((p) => p.id !== firstFrom)?.id ?? "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const from = pockets.find((p) => p.id === fromId);
  const groups = [...new Set(pockets.map((p) => p.group))];

  if (pockets.length < 2) return <p className="text-sm">You need at least two pockets to move money between them.</p>;

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
          const r = await moveMoneyAction(workspaceId, fromId, toId, month, amount);
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
          <option value="" disabled>Choose a pocket…</option>
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
        <button type="submit" className="btn btn-primary" disabled={pending || !toId}>{pending ? "Moving…" : "Move money"}</button>
      </div>
    </form>
  );
}

/** Add money to a pocket's assigned amount, taken from Ready to Assign. */
export interface FundingAccount { id: string; name: string; readyCents: number }

export function AddForm({ workspaceId, month, pockets, readyToAssignCents, initialId, accounts = [], initialAccountId = null, byPocket = {}, onDone, onCancel }: {
  workspaceId: string; month: string; pockets: MovePocket[]; readyToAssignCents: number; initialId?: string; onDone: () => void; onCancel: () => void;
  /** Bank accounts with ready cash; the money added is tagged to the one chosen ("" = best match). */
  accounts?: FundingAccount[]; initialAccountId?: string | null; byPocket?: Record<string, Record<string, number>>;
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
  const here = pocket ? byPocket[pocket.id] : undefined;

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
        <span className="text-slate-600 dark:text-slate-300">Ready to assign{chosen ? ` in ${chosen.name}` : ""}</span>{" "}
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
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {formatCents(a.readyCents)} free</option>)}
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
        {adding > ready && <p className="mt-1 text-xs text-warn">That&apos;s more than the {formatCents(ready)} ready to assign.</p>}
      </div>
      {error && <p role="alert" className="text-sm text-neg">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn" onClick={onCancel}>Cancel <span className="kbd">Esc</span></button>
        <button type="submit" className="btn btn-primary" disabled={pending || !id || ready <= 0}>{pending ? "Adding…" : "Add money"}</button>
      </div>
    </form>
  );
}

/** For one pocket: shows which account holds its money and moves some of it to another account. */
export function RetagForm({ workspaceId, month, pocket, accounts, byPocket, onDone }: {
  workspaceId: string; month: string; pocket: MovePocket; accounts: FundingAccount[]; byPocket: Record<string, Record<string, number>>; onDone: () => void;
}) {
  const here = byPocket[pocket.id] ?? {};
  const label = (k: string) => (k === "none" ? "Not linked yet" : accounts.find((a) => a.id === k)?.name ?? "Account");
  const sorted = Object.entries(here).sort((a, b) => b[1] - a[1]);
  const biggest = sorted[0]?.[0] ?? "none";
  const [fromKey, setFromKey] = useState(biggest);
  const [toId, setToId] = useState(accounts.find((a) => a.id !== biggest)?.id ?? "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const fromHas = here[fromKey] ?? 0;
  if (sorted.length === 0) return <p className="text-sm text-slate-500">Nothing in this pocket yet.</p>;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        start(async () => {
          const r = await retagPocketAction(workspaceId, month, pocket.id, fromKey, toId, amount);
          if (r.ok) onDone(); else setError(r.error);
        });
      }}
    >
      <ul className="nums space-y-0.5 text-sm">
        {sorted.map(([k, n]) => <li key={k} className="flex justify-between gap-3"><span className={k === "none" ? "text-warn" : ""}>{label(k)}</span><strong>{formatCents(n)}</strong></li>)}
      </ul>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="rt-from" className="label">Move from</label>
          <select id="rt-from" className="input" value={fromKey} onChange={(e) => { setFromKey(e.target.value); if (e.target.value === toId) setToId(accounts.find((a) => a.id !== e.target.value)?.id ?? ""); }}>
            {sorted.map(([k]) => <option key={k} value={k}>{label(k)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rt-to" className="label">to</label>
          <select id="rt-to" className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
            {accounts.filter((a) => a.id !== fromKey).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <input id="rt-amount" aria-label="Amount to move" required inputMode="decimal" placeholder="0.00" className="input nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button type="button" className="btn shrink-0" disabled={fromHas <= 0} onClick={() => setAmount(centsToInput(fromHas))}>All</button>
        <button type="submit" className="btn btn-primary shrink-0" disabled={pending || !toId || fromHas <= 0}>{pending ? "Saving…" : "Save"}</button>
      </div>
      {error && <p role="alert" className="text-sm text-neg">{error}</p>}
    </form>
  );
}
