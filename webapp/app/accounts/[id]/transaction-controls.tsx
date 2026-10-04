"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { Paperclip } from "lucide-react";
import { ReceiptField } from "@/components/receipt-field";
import { attachReceiptAction, createTransactionAction, removeReceiptAction, setTransactionCategoryAction } from "@/app/actions/transactions";

type CatOption = { id: string; name: string; group: string; type: "INCOME" | "EXPENSE" | "SYSTEM" };

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

export function AddTransactionButton({ accountId, isBusiness, categories, payees, today }: {
  accountId: string; isBusiness: boolean; categories: CatOption[]; payees: string[]; today: string;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"outflow" | "inflow">("outflow");
  const [state, action, pending] = useActionState(createTransactionAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

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
    if (state?.ok) { setOpen(false); formRef.current?.reset(); setDirection("outflow"); }
  }, [state]);

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Add transaction <span className="kbd !border-indigo-300 !bg-indigo-500 !text-white">N</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add transaction">
        <form ref={formRef} action={action} className="space-y-3">
          <input type="hidden" name="accountId" value={accountId} />
          <fieldset className="flex gap-2" aria-label="Direction">
            {(["outflow", "inflow"] as const).map((d) => (
              <label key={d} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-4 text-sm font-medium capitalize has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#2E6BE6] ${
                direction === d
                  ? d === "outflow" ? "border-[#C9372C] bg-red-50 text-[#C9372C] dark:bg-red-950" : "border-[#2E7D32] bg-emerald-50 text-[#2E7D32] dark:bg-emerald-950"
                  : "border-[#E2E8F0] dark:border-slate-700"
              }`}>
                <input type="radio" name="direction" value={d} checked={direction === d} onChange={() => setDirection(d)} className="sr-only" />
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
          <div>
            <label htmlFor="tx-cat" className="label">Category</label>
            <select id="tx-cat" name="categoryId" className="input" defaultValue="">
              <option value="">Uncategorized (decide later)</option>
              <CategoryOptions options={categories} />
            </select>
          </div>
          <div>
            <label htmlFor="tx-memo" className="label">Memo</label>
            <input id="tx-memo" name="memo" maxLength={500} className="input" />
          </div>
          <ReceiptField id="tx-receipt" />
          <div className="flex flex-wrap gap-x-6">
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="cleared" className="size-5" /> Cleared</label>
            {isBusiness && direction === "outflow" && (
              <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="deductible" className="size-5" /> Tax-deductible</label>
            )}
          </div>
          {state && !state.ok && <p role="alert" className="text-sm text-[#C9372C]">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel <span className="kbd">Esc</span></button>
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
