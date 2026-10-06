"use client";

import { FREQUENCIES } from "@/lib/recurring-math";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { Paperclip } from "lucide-react";
import { TagChips } from "@/components/tag-picker";
import { Affirmation, type Flow } from "@/components/affirmation";
import { ReceiptField } from "@/components/receipt-field";
import { attachReceiptAction, createTransactionAction, removeReceiptAction, setClearedAction, setTransactionCategoryAction, updateTransactionAction, setTransactionPersonAction } from "@/app/actions/transactions";

type CatOption = { id: string; name: string; group: string; type: "INCOME" | "EXPENSE" | "SYSTEM"; paidFromId?: string | null };

function CategoryOptions({ options }: { options: CatOption[] }) {
  const groups = [...new Set(options.map((o) => o.group))];
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {options.filter((o) => o.group === g).map((o) => (
            <option key={o.id} value={o.id}>{o.name}{o.type === "INCOME" ? " (income)" : ""}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export function AddTransactionButton({ accountId, accounts, isBusiness, categories, payees, today, people, currentUserId }: {
  people: { id: string; name: string }[]; currentUserId: string | null; accountId: string; accounts: { id: string; name: string; kind?: string }[]; isBusiness: boolean; categories: CatOption[]; payees: string[]; today: string;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Flow>("outflow");
  const [saved, setSaved] = useState<Flow | null>(null);
  // An inflow only counts toward Ready to assign when it has an income category, so pick one for you.
  const firstIncome = categories.find((c) => c.type === "INCOME")?.id ?? "";
  const [category, setCategory] = useState("");
  // Picking a pocket that is paid from a particular bank account switches the Account box to it (you can still change it).
  const [acct, setAcct] = useState(accountId);
  const pickCategory = (id: string) => {
    setCategory(id);
    const home = direction === "outflow" ? categories.find((c) => c.id === id)?.paidFromId : null;
    if (home && accounts.some((a) => a.id === home)) setAcct(home);
  };
  const pickDirection = (d: Flow) => { setDirection(d); setCategory(d === "inflow" ? firstIncome : ""); };
  const [state, action, pending] = useActionState(createTransactionAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const reset = () => { formRef.current?.reset(); setDirection("outflow"); setCategory(""); setAcct(accountId); setSaved(null); };

  // Hotkey: N opens "new transaction" unless you're typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest("input,textarea,select,[contenteditable=true],[role=dialog]")) return;
      e.preventDefault();
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (state?.ok) setSaved(direction); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Add transaction <span className="kbd hidden sm:inline-flex !border-indigo-300 !bg-indigo-500 !text-white">N</span>
      </button>
      <Modal open={open} onClose={() => { setOpen(false); reset(); }} title="Add transaction">
        {saved && <Affirmation flow={saved} onDone={() => { setOpen(false); reset(); }} onAnother={reset} />}
        <form ref={formRef} action={action} className={`space-y-3 ${saved ? "hidden" : ""}`}>
          <fieldset className="flex gap-2" aria-label="Direction">
            {(["outflow", "inflow"] as const).map((d) => (
              <label key={d} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-4 text-sm font-medium capitalize has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#2E6BE6] ${
                direction === d
                  ? d === "outflow" ? "border-[#C9372C] bg-red-50 text-[#C9372C] dark:bg-red-950" : "border-[#2E7D32] bg-emerald-50 text-[#2E7D32] dark:bg-emerald-950"
                  : "border-[#E2E8F0] dark:border-slate-700"
              }`}>
                <input type="radio" name="direction" value={d} checked={direction === d} onChange={() => pickDirection(d)} className="sr-only" />
                {d}
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tx-amount" className="label">Amount</label>
              <input id="tx-amount" name="amount" required inputMode="decimal" placeholder="0.00" className="input nums" />
            </div>
            <div>
              <label htmlFor="tx-date" className="label">Date</label>
              <input id="tx-date" name="date" type="date" required defaultValue={today} className="input" />
            </div>
          </div>
          <div>
            <label htmlFor="tx-payee" className="label">Payee</label>
            <input id="tx-payee" name="payee" list="payee-list" autoComplete="off" maxLength={200} className="input" />
            <datalist id="payee-list">{payees.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="tx-acct" className="label">Account</label>
              <select id="tx-acct" name="accountId" className="input" value={acct} onChange={(e) => setAcct(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.kind ? ` (${a.kind})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="tx-cat" className="label">Category</label>
              <select id="tx-cat" name="categoryId" className="input" value={category} onChange={(e) => pickCategory(e.target.value)}>
                <option value="">Uncategorized (decide later)</option>
                <CategoryOptions options={direction === "inflow" ? [...categories].sort((a, b) => Number(b.type === "INCOME") - Number(a.type === "INCOME")) : categories.filter((c) => c.type !== "INCOME")} />
              </select>
            </div>
          </div>
          <details className="rounded-xl border border-[#E2E8F0] dark:border-slate-700">
            <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold">More: repeat, memo, who, tags, receipt, cleared</summary>
            <div className="space-y-3 px-3 pb-3">
              <div>
                <label htmlFor="tx-repeat" className="label">Repeat</label>
                <select id="tx-repeat" name="repeat" className="input" defaultValue="">
                  <option value="">Just this once</option>
                  {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="tx-memo" className="label">Memo</label>
                <input id="tx-memo" name="memo" maxLength={500} className="input" />
              </div>
              {people.length > 1 && (
                <div>
                  <label htmlFor="tx-who" className="label">Who</label>
                  <select id="tx-who" name="personId" className="input" defaultValue={currentUserId ?? ""}>
                    {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )}
              {direction === "outflow" && <TagChips idPrefix="tx-tag" />}
              <ReceiptField id="tx-receipt" />
              <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="cleared" className="size-5" /> Cleared</label>
            </div>
          </details>
          {isBusiness && direction === "outflow" && (
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="deductible" className="size-5" /> Tax-deductible</label>
          )}
          {state && !state.ok && <p role="alert" className="text-sm text-[#C9372C]">{state.error}</p>}
          <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 bg-white px-1 pb-1 pt-2 dark:bg-slate-900">
            <button type="button" className="btn" onClick={() => { setOpen(false); reset(); }}>Cancel <span className="kbd">Esc</span></button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function CategorySelect({ transactionId, current, options, needsReview }: {
  transactionId: string; current: string; options: CatOption[]; needsReview: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setTransactionCategoryAction}>
      <input type="hidden" name="transactionId" value={transactionId} />
      <select
        name="categoryId"
        aria-label="Category"
        defaultValue={current}
        onChange={() => formRef.current?.requestSubmit()}
        className={`input !min-h-10 !py-1.5 ${needsReview && !current ? "!border-[#8A5A00]" : ""}`}
      >
        <option value="">{needsReview ? "Needs a category" : "Uncategorized"}</option>
        <CategoryOptions options={options} />
      </select>
    </form>
  );
}

export function ConfirmDeleteButton() {
  return (
    <button
      type="submit"
      className="btn btn-sm !min-h-9"
      aria-label="Delete transaction"
      onClick={(e) => { if (!window.confirm("Delete this transaction permanently?")) e.preventDefault(); }}
    >
      <Trash2 className="size-3.5" aria-hidden />
    </button>
  );
}

/** Paperclip on a transaction row: view the receipt, or attach one. */
export function ReceiptCell({ transactionId, receipt }: { transactionId: string; receipt: { id: string; fileName: string | null } | null }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(attachReceiptAction, undefined);
  return (
    <div className="flex items-center gap-1">
      {receipt && (
        <>
          <a href={`/receipts/${receipt.id}`} target="_blank" rel="noopener" className="btn btn-sm !min-h-9" aria-label={`View receipt${receipt.fileName ? ` ${receipt.fileName}` : ""}`}>
            <Paperclip className="size-3.5 text-pos" aria-hidden /> <span className="hidden sm:inline">Receipt</span>
          </a>
          <form action={removeReceiptAction}>
            <input type="hidden" name="transactionId" value={transactionId} />
            <button type="submit" className="btn btn-sm !min-h-9 !px-2" aria-label="Remove receipt" onClick={(e) => { if (!window.confirm("Remove this receipt?")) e.preventDefault(); }}>✕</button>
          </form>
        </>
      )}
      {!receipt && (
        <form ref={formRef} action={action}>
          <input type="hidden" name="transactionId" value={transactionId} />
          <ReceiptField id={`rc-${transactionId}`} compact onReady={() => formRef.current?.requestSubmit()} />
          {state && !state.ok && <p role="alert" className="mt-1 text-xs text-neg">{state.error}</p>}
        </form>
      )}
    </div>
  );
}

export function PersonSelect({ transactionId, current, people }: { transactionId: string; current: string; people: { id: string; name: string }[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setTransactionPersonAction}>
      <input type="hidden" name="transactionId" value={transactionId} />
      <select name="personId" aria-label="Who" defaultValue={current} onChange={() => formRef.current?.requestSubmit()} className="input !min-h-10 !w-auto !min-w-24 !py-1.5">
        <option value="">—</option>
        {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
    </form>
  );
}

/** Round tick on each row: filled green = the bank has posted it; empty = still pending. Counts in the total either way. */
export function ClearedButton({ transactionId, status }: { transactionId: string; status: "UNCLEARED" | "CLEARED" | "RECONCILED" }) {
  const done = status !== "UNCLEARED";
  const locked = status === "RECONCILED";
  return (
    <form action={setClearedAction}>
      <input type="hidden" name="transactionId" value={transactionId} />
      <input type="hidden" name="cleared" value={done ? "0" : "1"} />
      <button
        type="submit"
        disabled={locked}
        title={locked ? "Reconciled" : done ? "Cleared. Tap to mark pending again" : "Pending. Tap when the bank has posted it"}
        aria-label={locked ? "Reconciled" : done ? "Cleared. Mark as pending" : "Pending. Mark as cleared"}
        className={`flex size-8 items-center justify-center rounded-full border-2 transition-colors ${done ? "border-pos bg-pos text-white" : "border-slate-300 text-transparent hover:border-pos hover:text-pos/60 dark:border-slate-600"} ${locked ? "opacity-70" : ""}`}
      >
        <Check className="size-4" aria-hidden />
      </button>
    </form>
  );
}

export type EditableTx = {
  id: string; date: string; payee: string; amountCents: number; memo: string; categoryId: string; personId: string;
  status: "UNCLEARED" | "CLEARED" | "RECONCILED"; isTransfer: boolean; isSplit: boolean; deductible: boolean; source: string | null;
};

/** Opens a full edit form for one transaction, so every detail can be seen and changed. */
export function EditTransactionButton({ tx, categories, payees, people, isBusiness, label }: {
  tx: EditableTx; categories: CatOption[]; payees: string[]; people: { id: string; name: string }[]; isBusiness: boolean; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Flow>(tx.amountCents > 0 ? "inflow" : "outflow");
  const [state, action, pending] = useActionState(updateTransactionAction, undefined);
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);
  const locked = tx.isTransfer || tx.isSplit;
  const listId = `edit-payees-${tx.id}`;
  return (
    <>
      <button type="button" className="btn btn-sm !min-h-9" aria-label="Edit transaction" onClick={() => { setDirection(tx.amountCents > 0 ? "inflow" : "outflow"); setOpen(true); }}>
        <Pencil className="size-3.5" aria-hidden />{label && <span>{label}</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit transaction">
        <form action={action} className="space-y-3">
          <input type="hidden" name="transactionId" value={tx.id} />
          {tx.isTransfer && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">This is a transfer between two accounts. You can change its date, note and cleared status; the amount stays matched on both sides.</p>}
          {tx.isSplit && !tx.isTransfer && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">This purchase is split between pockets (for example business and personal). Amount and pocket are locked; delete and re-enter it to change them.</p>}
          {!locked && (
            <fieldset className="flex gap-2" aria-label="Direction">
              {(["outflow", "inflow"] as const).map((d) => (
                <label key={d} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-4 text-sm font-medium capitalize ${direction === d ? (d === "outflow" ? "border-[#C9372C] bg-red-50 text-[#C9372C] dark:bg-red-950" : "border-[#2E7D32] bg-emerald-50 text-[#2E7D32] dark:bg-emerald-950") : "border-[#E2E8F0] dark:border-slate-700"}`}>
                  <input type="radio" name="direction" value={d} checked={direction === d} onChange={() => setDirection(d)} className="sr-only" />{d}
                </label>
              ))}
            </fieldset>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`e-amt-${tx.id}`} className="label">Amount</label>
              {locked
                ? <div className="nums input flex items-center bg-slate-50 dark:bg-slate-800">{tx.amountCents < 0 ? "−" : "+"}{(Math.abs(tx.amountCents) / 100).toFixed(2)}</div>
                : <input id={`e-amt-${tx.id}`} name="amount" required inputMode="decimal" defaultValue={(Math.abs(tx.amountCents) / 100).toFixed(2)} className="input nums" />}
            </div>
            <div>
              <label htmlFor={`e-date-${tx.id}`} className="label">Date</label>
              <input id={`e-date-${tx.id}`} name="date" type="date" required defaultValue={tx.date} className="input" />
            </div>
          </div>
          {!tx.isTransfer && (
            <>
              <div>
                <label htmlFor={`e-payee-${tx.id}`} className="label">Payee</label>
                <input id={`e-payee-${tx.id}`} name="payee" list={listId} autoComplete="off" maxLength={200} defaultValue={tx.payee} className="input" />
                <datalist id={listId}>{payees.map((p) => <option key={p} value={p} />)}</datalist>
              </div>
              {!tx.isSplit && (
                <div>
                  <label htmlFor={`e-cat-${tx.id}`} className="label">Category</label>
                  <select id={`e-cat-${tx.id}`} name="categoryId" className="input" defaultValue={tx.categoryId}>
                    <option value="">Uncategorized (decide later)</option>
                    <CategoryOptions options={direction === "inflow" ? [...categories].sort((a, b) => Number(b.type === "INCOME") - Number(a.type === "INCOME")) : categories.filter((c) => c.type !== "INCOME")} />
                  </select>
                </div>
              )}
              {people.length > 1 && (
                <div>
                  <label htmlFor={`e-who-${tx.id}`} className="label">Who</label>
                  <select id={`e-who-${tx.id}`} name="personId" className="input" defaultValue={tx.personId}>
                    <option value="">Not assigned</option>
                    {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
          <div>
            <label htmlFor={`e-memo-${tx.id}`} className="label">Memo</label>
            <input id={`e-memo-${tx.id}`} name="memo" maxLength={500} defaultValue={tx.memo} className="input" />
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" name="cleared" className="size-5" defaultChecked={tx.status !== "UNCLEARED"} disabled={tx.status === "RECONCILED"} />
            {tx.status === "RECONCILED" ? "Reconciled (locked as cleared)" : "Cleared (the bank has posted it)"}
          </label>
          {tx.status === "RECONCILED" && <input type="hidden" name="cleared" value="on" />}
          {isBusiness && !locked && direction === "outflow" && (
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="deductible" className="size-5" defaultChecked={tx.deductible} /> Tax-deductible</label>
          )}
          {tx.source && <p className="text-xs text-slate-500">Imported from {tx.source}</p>}
          {state && !state.ok && <p role="alert" className="text-sm text-[#C9372C]">{state.error}</p>}
          <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 bg-white px-1 pb-1 pt-2 dark:bg-slate-900">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel <span className="kbd">Esc</span></button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
