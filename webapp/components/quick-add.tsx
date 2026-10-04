"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, ArrowRightLeft, HandCoins, Plus } from "lucide-react";
import { ReceiptField } from "@/components/receipt-field";
import { MoveForm } from "@/components/move-money";
import { Modal } from "@/components/modal";
import { createTransactionAction } from "@/app/actions/transactions";
import { assignMoreAction } from "@/app/actions/pockets";
import { getQuickAddDataAction, type QuickAddData } from "@/app/actions/quick";
import { centsToInput, formatCents } from "@/lib/utils/currency";

type Mode = "tx" | "assign" | "move";

export function QuickAdd() {
  const ws = useSearchParams().get("ws") === "business" ? "business" : "personal";
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [data, setData] = useState<QuickAddData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  async function pick(m: Mode) {
    setMenu(false); setMode(m); setData(null); setLoadError(false);
    try { setData(await getQuickAddDataAction(ws)); } catch { setLoadError(true); }
  }
  const close = () => { setMode(null); };
  const done = () => { setMode(null); router.refresh(); };

  const row = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800";
  return (
    <>
      <div ref={box} className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 md:bottom-8 md:right-8">
        {menu && (
          <div role="menu" className="card absolute bottom-16 right-0 w-60 p-1.5 shadow-xl">
            <button role="menuitem" type="button" className={row} onClick={() => pick("tx")}>
              <span className="flex size-9 items-center justify-center rounded-full bg-blue-50 text-[#2E6BE6] dark:bg-blue-950"><ArrowLeftRight className="size-4" aria-hidden /></span> Add transaction
            </button>
            <button role="menuitem" type="button" className={row} onClick={() => pick("assign")}>
              <span className="flex size-9 items-center justify-center rounded-full bg-pos-soft text-pos"><HandCoins className="size-4" aria-hidden /></span> Assign money
            </button>
            <button role="menuitem" type="button" className={row} onClick={() => pick("move")}>
              <span className="flex size-9 items-center justify-center rounded-full bg-cyan-50 text-water dark:bg-cyan-950"><ArrowRightLeft className="size-4" aria-hidden /></span> Move money
            </button>
          </div>
        )}
        <button
          type="button" aria-label="Quick add" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}
          className="flex size-14 items-center justify-center rounded-full bg-gradient-to-b from-[#3B7BF0] to-[#2557C4] text-white shadow-lg shadow-blue-900/30 transition-transform hover:scale-105 active:scale-95"
        >
          <Plus className={`size-7 transition-transform duration-200 ${menu ? "rotate-45" : ""}`} aria-hidden />
        </button>
      </div>

      {mode && (
        <Modal open onClose={close} title={mode === "tx" ? "Add transaction" : mode === "move" ? "Move money between pockets" : "Assign money"}>
          {loadError ? (
            <p role="alert" className="text-sm text-neg">Couldn&apos;t load your accounts. Please try again.</p>
          ) : !data ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
          ) : mode === "tx" ? (
            <TxForm data={data} onDone={done} onCancel={close} />
          ) : mode === "move" ? (
            <MoveForm
              workspaceId={data.workspaceId} month={data.month} onDone={done} onCancel={close}
              pockets={data.categories.filter((c) => c.type === "EXPENSE").map((c) => ({ id: c.id, name: c.name, group: c.group, availableCents: c.availableCents }))}
            />
          ) : (
            <AssignForm data={data} onDone={done} onCancel={close} />
          )}
        </Modal>
      )}
    </>
  );
}

function CategoryOptions({ options }: { options: QuickAddData["categories"] }) {
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

function TxForm({ data, onDone, onCancel }: { data: QuickAddData; onDone: () => void; onCancel: () => void }) {
  const [direction, setDirection] = useState<"outflow" | "inflow">("outflow");
  const [state, action, pending] = useActionState(createTransactionAction, undefined);
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);

  if (data.accounts.length === 0) {
    return (
      <div className="space-y-4 text-sm">
        <p>You need an account before you can add a transaction.</p>
        <a className="btn btn-primary" href={`/accounts${data.isBusiness ? "?ws=business" : ""}`}>Add an account</a>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <fieldset className="flex gap-2" aria-label="Direction">
        {(["outflow", "inflow"] as const).map((d) => (
          <label key={d} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-4 text-sm font-medium capitalize has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#2E6BE6] ${
            direction === d
              ? d === "outflow" ? "border-[#C9372C] bg-neg-soft text-neg" : "border-[#2E7D32] bg-pos-soft text-pos"
              : "border-[#E2E8F0] dark:border-slate-700"
          }`}>
            <input type="radio" name="direction" value={d} checked={direction === d} onChange={() => setDirection(d)} className="sr-only" />
            {d === "outflow" ? "Spent" : "Received"}
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="qa-amount" className="label">Amount</label>
          <input id="qa-amount" data-autofocus name="amount" required inputMode="decimal" placeholder="0.00" className="input nums" />
        </div>
        <div>
          <label htmlFor="qa-date" className="label">Date</label>
          <input id="qa-date" name="date" type="date" required defaultValue={data.today} className="input" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="qa-acct" className="label">Account</label>
          <select id="qa-acct" name="accountId" className="input" defaultValue={data.accounts[0].id}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="qa-cat" className="label">Pocket</label>
          <select id="qa-cat" name="categoryId" className="input" defaultValue="">
            <option value="">Uncategorized (decide later)</option>
            <CategoryOptions options={data.categories} />
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="qa-payee" className="label">Payee</label>
        <input id="qa-payee" name="payee" list="qa-payees" autoComplete="off" maxLength={200} className="input" />
        <datalist id="qa-payees">{data.payees.map((p) => <option key={p} value={p} />)}</datalist>
      </div>
      <div>
        <label htmlFor="qa-memo" className="label">Memo</label>
        <input id="qa-memo" name="memo" maxLength={500} className="input" />
      </div>
      <ReceiptField id="qa-receipt" />
      {data.isBusiness && direction === "outflow" && (
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="deductible" className="size-5" /> Tax-deductible</label>
      )}
      {state && !state.ok && <p role="alert" className="text-sm text-neg">{state.error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn" onClick={onCancel}>Cancel <span className="kbd">Esc</span></button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

function AssignForm({ data, onDone, onCancel }: { data: QuickAddData; onDone: () => void; onCancel: () => void }) {
  const pockets = data.categories.filter((c) => c.type === "EXPENSE");
  const [categoryId, setCategoryId] = useState(pockets[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const rta = Math.max(0, data.readyToAssignCents);

  if (pockets.length === 0) return <p className="text-sm">Add a pocket first, then you can assign money to it.</p>;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        start(async () => {
          const r = await assignMoreAction(data.workspaceId, categoryId, data.month, amount);
          if (r.ok) onDone(); else setError(r.error);
        });
      }}
    >
      <div className="flex items-center justify-between rounded-xl bg-pos-soft px-4 py-3">
        <span className="text-sm text-pos">Ready to assign</span>
        <span className="nums text-lg font-bold text-pos">{formatCents(data.readyToAssignCents)}</span>
      </div>
      <div>
        <label htmlFor="as-pocket" className="label">Pocket</label>
        <select id="as-pocket" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <CategoryOptions options={pockets} />
        </select>
      </div>
      <div>
        <label htmlFor="as-amount" className="label">Amount to add</label>
        <div className="flex gap-2">
          <input id="as-amount" data-autofocus inputMode="decimal" placeholder="0.00" className="input nums" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <button type="button" className="btn shrink-0" onClick={() => setAmount(centsToInput(rta))} disabled={rta === 0}>All</button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-neg">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn" onClick={onCancel}>Cancel <span className="kbd">Esc</span></button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Assigning…" : "Assign"}</button>
      </div>
    </form>
  );
}
