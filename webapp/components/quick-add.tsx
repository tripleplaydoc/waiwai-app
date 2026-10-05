"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Landmark, Plus, ShoppingBag } from "lucide-react";
import { Affirmation, type Flow } from "@/components/affirmation";
import { ReceiptField } from "@/components/receipt-field";
import { TagChips } from "@/components/tag-picker";
import { Modal } from "@/components/modal";
import { createTransactionAction } from "@/app/actions/transactions";
import { payCardAction } from "@/app/actions/cards";
import { payLoanAction } from "@/app/actions/loans";
import { assignMoreAction, moveMoneyAction } from "@/app/actions/pockets";
import { getQuickAddDataAction, suggestPocketsAction, type QuickAddData, type SuggestData } from "@/app/actions/quick";
import { centsToInput, formatCents, parseToCents } from "@/lib/utils/currency";
import { planPurchase, type AffordResult } from "@/lib/budget/afford";
import { taxSavingCents } from "@/lib/budget/suggest";
import { MIXED_USE_TYPES, deductibleShareBps } from "@/lib/budget/expense-types";

type Mode = "tx" | "afford" | "pay";

export function QuickAdd() {
  const ws = useSearchParams().get("ws") === "business" ? "business" : "personal";
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [data, setData] = useState<QuickAddData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [round, setRound] = useState(0);
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
      <div ref={box} className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] right-4 z-40 md:bottom-8 md:right-8">
        {menu && (
          <div role="menu" className="card absolute bottom-16 right-0 w-60 p-1.5 shadow-xl">
            <button role="menuitem" type="button" className={row} onClick={() => pick("tx")}>
              <span className="flex size-9 items-center justify-center rounded-full bg-blue-50 text-[#2E6BE6] dark:bg-blue-950"><ArrowLeftRight className="size-4" aria-hidden /></span> Add transaction
            </button>
            <button role="menuitem" type="button" className={row} onClick={() => pick("pay")}>
              <span className="flex size-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950"><Landmark className="size-4" aria-hidden /></span> Pay card or loan
            </button>
            <button role="menuitem" type="button" className={row} onClick={() => pick("afford")}>
              <span className="flex size-9 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950"><ShoppingBag className="size-4" aria-hidden /></span> Can I buy this?
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
        <Modal open onClose={close} title={mode === "tx" ? "Add transaction" : mode === "pay" ? "Pay a card or loan" : "Can I buy this?"}>
          {loadError ? (
            <p role="alert" className="text-sm text-neg">Couldn&apos;t load your accounts. Please try again.</p>
          ) : !data ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
          ) : mode === "tx" ? (
            <TxForm key={round} data={data} onDone={done} onCancel={close} onAnother={() => setRound((r) => r + 1)} />
          ) : mode === "pay" ? (
            <PayDebtForm data={data} onDone={done} onCancel={close} />
          ) : (
            <AffordForm data={data} onDone={done} onCancel={close} />
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

function TxForm({ data, onDone, onCancel, onAnother }: { data: QuickAddData; onDone: () => void; onCancel: () => void; onAnother: () => void }) {
  const [direction, setDirection] = useState<Flow>("outflow");
  const [saved, setSaved] = useState<Flow | null>(null);
  // An inflow only counts toward Ready to assign when it has an income category, so pick one for you.
  const firstIncome = data.categories.find((c) => c.type === "INCOME")?.id ?? "";
  const [category, setCategory] = useState("");
  // Picking a pocket that is paid from a particular bank account switches the Account box to it (you can still change it).
  const [acct, setAcct] = useState(data.accounts[0].id);
  const pickCategory = (id: string) => {
    setCategory(id);
    const home = direction === "outflow" ? data.categories.find((c) => c.id === id)?.paidFromId : null;
    if (home && data.accounts.some((a) => a.id === home)) setAcct(home);
  };
  const pickDirection = (d: Flow) => { setDirection(d); setCategory(d === "inflow" ? firstIncome : ""); setSuggest(null); };
  // Smart suggestions: what is typed in Payee / Memo is matched to this workspace's history and to built-in vendor rules.
  const [payeeText, setPayeeText] = useState("");
  const [memoText, setMemoText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [deductible, setDeductible] = useState(false);
  const [suggest, setSuggest] = useState<SuggestData | null>(null);
  const typed = `${payeeText} ${memoText}`.trim();
  useEffect(() => {
    if (direction !== "outflow" || typed.length < 2) { setSuggest(null); return; }
    let live = true;
    const t = setTimeout(() => {
      suggestPocketsAction(data.isBusiness ? "business" : "personal", typed).then((r) => { if (live) setSuggest(r); }).catch(() => { if (live) setSuggest(null); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [typed, direction, data.isBusiness]);
  const amountCents = parseToCents(amountText) ?? 0;
  const chosenType = data.categories.find((c) => c.id === category)?.expenseType ?? null;
  const askUse = data.isBusiness && direction === "outflow" && !!chosenType && MIXED_USE_TYPES.includes(chosenType);
  const askMeal = data.isBusiness && direction === "outflow" && chosenType === "MEALS";
  const [bizPct, setBizPct] = useState("100");
  const pctNum = Math.min(100, Math.max(1, Math.round(Number(bizPct) || 100)));
  const deductibleCents = Math.round((amountCents * (askUse ? pctNum : 100) / 100) * deductibleShareBps(chosenType) / 10000);
  const chooseSuggestion = (id: string, deductibleToo: boolean) => { pickCategory(id); if (deductibleToo && data.isBusiness) setDeductible(true); };
  const [state, action, pending] = useActionState(createTransactionAction, undefined);
  useEffect(() => { if (state?.ok) setSaved(direction); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (saved) return <Affirmation flow={saved} onDone={onDone} onAnother={onAnother} />;

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
            <input type="radio" name="direction" value={d} checked={direction === d} onChange={() => pickDirection(d)} className="sr-only" />
            {d}
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="qa-amount" className="label">Amount</label>
          <input id="qa-amount" data-autofocus name="amount" required inputMode="decimal" placeholder="0.00" className="input nums" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </div>
        <div>
          <label htmlFor="qa-date" className="label">Date</label>
          <input id="qa-date" name="date" type="date" required defaultValue={data.today} className="input" />
        </div>
      </div>
      <div>
        <label htmlFor="qa-payee" className="label">Payee</label>
        <input id="qa-payee" name="payee" list="qa-payees" autoComplete="off" maxLength={200} className="input" value={payeeText} onChange={(e) => setPayeeText(e.target.value)} />
        <datalist id="qa-payees">{data.payees.map((p) => <option key={p} value={p} />)}</datalist>
      </div>
      <div>
        <label htmlFor="qa-memo" className="label">Memo</label>
        <input id="qa-memo" name="memo" maxLength={500} className="input" value={memoText} onChange={(e) => setMemoText(e.target.value)} />
      </div>
      {direction === "outflow" && suggest && (suggest.suggestions.length > 0 || suggest.hint) && (
        <div role="group" aria-label="Suggested pockets" aria-live="polite" className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested pocket</p>
          {suggest.suggestions.map((sg) => {
            const on = category === sg.categoryId;
            const saves = sg.deductible && amountCents > 0 ? taxSavingCents(Math.round(amountCents * deductibleShareBps(data.categories.find((c) => c.id === sg.categoryId)?.expenseType) / 10000), suggest.taxBps) : 0;
            return (
              <button key={sg.categoryId} type="button" aria-pressed={on} onClick={() => chooseSuggestion(sg.categoryId, sg.deductible)}
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left ${on ? "border-[#2E6BE6] bg-blue-50 dark:bg-blue-950/40" : "border-[#E2E8F0] hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{sg.name} <span className="font-normal text-slate-500">· {sg.group}</span></span>
                  <span className="block text-xs text-slate-500">{sg.reason}</span>
                </span>
                {sg.deductible && (
                  <span className="nums shrink-0 rounded-full bg-pos-soft px-2 py-0.5 text-[11px] font-semibold text-pos">Deductible{saves > 0 ? ` · saves ${formatCents(saves)}` : ""}</span>
                )}
              </button>
            );
          })}
          {suggest.suggestions.length === 0 && suggest.hint && (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">This looks like <strong>{suggest.hint.label}</strong>, but you don&apos;t have a pocket for that yet. Pick the closest pocket below, or add one from the budget page.</p>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="qa-acct" className="label">Account</label>
          <select id="qa-acct" name="accountId" className="input" value={acct} onChange={(e) => setAcct(e.target.value)}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.kind ? ` (${a.kind})` : ""}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="qa-cat" className="label">Pocket</label>
          <select id="qa-cat" name="categoryId" className="input" value={category} onChange={(e) => pickCategory(e.target.value)}>
            <option value="">Uncategorized (decide later)</option>
            <CategoryOptions options={direction === "inflow" ? [...data.categories].sort((a, b) => Number(b.type === "INCOME") - Number(a.type === "INCOME")) : data.categories.filter((c) => c.type !== "INCOME")} />
          </select>
        </div>
      </div>
      {data.people.length > 1 && (
        <div>
          <label htmlFor="qa-who" className="label">Who</label>
          <select id="qa-who" name="personId" className="input" defaultValue={data.currentUserId ?? ""}>
            {data.people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}
      {direction === "outflow" && <TagChips idPrefix="qa-tag" />}
      <ReceiptField id="qa-receipt" />
      {askUse && (
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
          <label htmlFor="qa-biz" className="label">How much of this is for the business?</label>
          <div className="flex items-center gap-2">
            <input id="qa-biz" name="bizPct" inputMode="numeric" className="input nums w-24" value={bizPct} onChange={(e) => setBizPct(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} />
            <span className="text-sm">% business</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Only the business part is deductible. The rest is filed as Owner&apos;s draw (personal use) so your profit isn&apos;t understated. Phone, internet, car and home-office costs are usually shared.</p>
        </div>
      )}
      {askMeal && (
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
          <label htmlFor="qa-purpose" className="label">Who was it with, and why? (business purpose)</label>
          <input id="qa-purpose" name="purpose" maxLength={200} className="input" placeholder="Client lunch to review the renewal" />
          <p className="mt-1 text-xs text-slate-500">Business meals are generally only 50% deductible, and the IRS expects a note of who and why.</p>
        </div>
      )}
      {data.isBusiness && direction === "outflow" && (
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="deductible" className="size-5" checked={deductible} onChange={(e) => setDeductible(e.target.checked)} /> Tax-deductible{deductible && amountCents > 0 && data.isBusiness ? <span className="nums text-xs text-slate-500">· about {formatCents(taxSavingCents(deductibleCents, suggest?.taxBps ?? 3000))} less tax reserve needed{chosenType === "MEALS" ? " (meals count 50%)" : ""}</span> : null}</label>
      )}
      {state && !state.ok && <p role="alert" className="text-sm text-neg">{state.error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn" onClick={onCancel}>Cancel <span className="kbd">Esc</span></button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

function PayDebtForm({ data, onDone, onCancel }: { data: QuickAddData; onDone: () => void; onCancel: () => void }) {
  const payFrom = data.accounts.filter((a) => a.kind === "debit" || a.kind === "savings" || a.kind === "cash");
  const [debtId, setDebtId] = useState(data.debts[0]?.id ?? "");
  const debt = data.debts.find((d) => d.id === debtId);
  const [amount, setAmount] = useState(debt && debt.suggestCents > 0 ? centsToInput(debt.suggestCents) : "");
  const [principal, setPrincipal] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  // For a loan, guess how much of the payment lowers the balance: payment minus a month of interest.
  const guess = (cents: number) => debt && debt.kind === "loan" ? Math.max(0, cents - Math.round((debt.owedCents * debt.aprBps) / 10000 / 12)) : 0;
  function choose(id: string) {
    setDebtId(id);
    const d = data.debts.find((x) => x.id === id);
    setAmount(d && d.suggestCents > 0 ? centsToInput(d.suggestCents) : ""); setPrincipal("");
  }
  if (data.debts.length === 0) return <p className="py-4 text-sm">You don&apos;t have a credit card or loan in {data.isBusiness ? "Business" : "Personal"} yet. Add one on the Accounts page.</p>;
  if (payFrom.length === 0) return <p className="py-4 text-sm">Add a checking, savings or cash account to pay from first.</p>;
  const cents = parseToCents(amount);
  const principalHint = cents && debt?.kind === "loan" ? guess(cents) : 0;
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    const fd = new FormData(e.currentTarget);
    if (debt?.kind === "loan") { fd.set("loanId", debtId); fd.set("principal", principal.trim() || (principalHint ? centsToInput(principalHint) : "")); } else fd.set("cardId", debtId);
    start(async () => {
      const r = debt?.kind === "loan" ? await payLoanAction(undefined, fd) : await payCardAction(undefined, fd);
      if (!r.ok) { setError(r.error); return; }
      onDone();
    });
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="pd-debt" className="label">What are you paying?</label>
        <select id="pd-debt" className="input" value={debtId} onChange={(e) => choose(e.target.value)}>
          {data.debts.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.kind === "card" ? "credit card" : "loan"}) · owe {formatCents(d.owedCents)}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="pd-from" className="label">Pay from</label>
        <select id="pd-from" name="fromAccountId" className="input" defaultValue={payFrom[0]?.id}>{payFrom.map((a) => <option key={a.id} value={a.id}>{a.name}{a.kind ? ` (${a.kind})` : ""}</option>)}</select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="pd-amt" className="label">Amount</label><input id="pd-amt" name="amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="input nums" placeholder="0.00" /></div>
        <div><label htmlFor="pd-date" className="label">Date</label><input id="pd-date" name="date" type="date" defaultValue={data.today} className="input" /></div>
      </div>
      {debt && debt.owedCents > 0 && <button type="button" className="rounded-full border border-[#E2E8F0] px-3 py-2 text-xs font-semibold dark:border-slate-700" onClick={() => setAmount(centsToInput(debt.owedCents))}>Pay it all off {formatCents(debt.owedCents)}</button>}
      {debt?.kind === "loan" && (
        <div>
          <label htmlFor="pd-prin" className="label">Part that lowers what you owe (the rest is interest)</label>
          <input id="pd-prin" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} className="input nums" placeholder={principalHint ? centsToInput(principalHint) : "0.00"} />
        </div>
      )}
      <p className="text-xs text-slate-500">{debt?.kind === "loan" ? "This takes the payment out of the account you pick, counts it in the loan's pocket, and lowers the balance you owe." : "This moves money from your account to the card. It isn't spending, so none of your pockets change."}</p>
      {error && <p role="alert" className="text-sm text-neg">{error}</p>}
      <div className="flex justify-end gap-2 pt-1"><button type="button" className="btn" onClick={onCancel}>Cancel <span className="kbd">Esc</span></button><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Record payment"}</button></div>
    </form>
  );
}

function AffordForm({ data, onDone, onCancel }: { data: QuickAddData; onDone: () => void; onCancel: () => void }) {
  const pockets = data.categories.filter((c) => c.type === "EXPENSE");
  const [what, setWhat] = useState("");
  const [amount, setAmount] = useState("");
  const [pocketId, setPocketId] = useState(pockets[0]?.id ?? "");
  const [result, setResult] = useState<AffordResult | null>(null);
  const [error, setError] = useState<string>();
  const [applied, setApplied] = useState(false);
  const [pending, start] = useTransition();

  const pocket = pockets.find((p) => p.id === pocketId);
  function check(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined); setApplied(false);
    const cents = parseToCents(amount);
    if (!pocket || cents === null || cents <= 0) { setError("Enter the price, like 89.99, and pick a pocket."); return; }
    setResult(planPurchase({ amountCents: cents, pocket, pockets: data.categories, readyToAssignCents: data.readyToAssignCents }));
  }
  function apply() {
    if (!result || !pocket) return;
    setError(undefined);
    start(async () => {
      for (const s of result.sources) {
        const amt = centsToInput(s.cents);
        const r = s.pocketId === null
          ? await assignMoreAction(data.workspaceId, pocket.id, data.month, amt)
          : await moveMoneyAction(data.workspaceId, s.pocketId, pocket.id, data.month, amt);
        if (!r.ok) { setError(r.error); return; }
      }
      setApplied(true);
    });
  }
  const tone = !result ? "" : result.verdict === "yes" ? "border-[#2E7D32] bg-pos-soft text-pos" : result.verdict === "yes_after_moves" ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "border-[#C9372C] bg-neg-soft text-neg";

  return (
    <div className="space-y-3">
      <form onSubmit={check} className="space-y-3">
        <div>
          <label htmlFor="af-what" className="label">What do you want to buy?</label>
          <input id="af-what" data-autofocus className="input" placeholder="New running shoes" value={what} onChange={(e) => { setWhat(e.target.value); setResult(null); }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="af-amount" className="label">Price</label>
            <input id="af-amount" inputMode="decimal" placeholder="0.00" className="input nums" value={amount} onChange={(e) => { setAmount(e.target.value); setResult(null); }} required />
          </div>
          <div>
            <label htmlFor="af-pocket" className="label">Pocket</label>
            <select id="af-pocket" className="input" value={pocketId} onChange={(e) => { setPocketId(e.target.value); setResult(null); }}>
              <CategoryOptions options={pockets} />
            </select>
          </div>
        </div>
        {!result && (
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn" onClick={onCancel}>Cancel <span className="kbd">Esc</span></button>
            <button type="submit" className="btn btn-primary">Check</button>
          </div>
        )}
        {result && <button type="submit" className="btn w-full">Check again</button>}
      </form>

      {result && pocket && (
        <div className="space-y-3" aria-live="polite">
          <div className={`rounded-xl border px-4 py-3 text-sm ${tone}`}>
            {result.verdict === "yes" && (<><p className="font-semibold">Yes, {what.trim() || "it"} fits in {pocket.name}.</p><p className="nums mt-1">{formatCents(result.pocketAvailableCents)} available, {formatCents(result.leftAfterCents)} left after.</p></>)}
            {result.verdict === "yes_after_moves" && (<><p className="font-semibold">Not from {pocket.name} alone. You&apos;re {formatCents(result.shortfallCents)} short, but you can cover it.</p><p className="nums mt-1">{formatCents(result.pocketAvailableCents)} available in {pocket.name}.</p></>)}
            {result.verdict === "partly" && (<p className="font-semibold">You&apos;re {formatCents(result.shortfallCents)} short and could only find {formatCents(result.coveredCents)} to borrow. That leaves {formatCents(result.stillShortCents)} uncovered.</p>)}
            {result.verdict === "no" && (<p className="font-semibold">Not right now. {pocket.name} has {formatCents(result.pocketAvailableCents)} and nothing else is free to borrow.</p>)}
            {result.warning && <p className="mt-1">{result.warning}</p>}
          </div>

          {result.sources.length > 0 && (
            <div>
              <p className="label">{result.verdict === "yes_after_moves" ? "Borrow from, in this order" : "Best you can do"}</p>
              <ul className="divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] dark:divide-slate-700 dark:border-slate-700">
                {result.sources.map((s, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                    <span><span className="font-semibold">{s.name}</span><span className="block text-xs text-slate-500">{s.note}</span></span>
                    <span className="nums shrink-0 font-semibold">{formatCents(s.cents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p role="alert" className="text-sm text-neg">{error}</p>}
          {applied ? (
            <div className="space-y-2">
              <p className="text-sm text-pos">Done. {pocket.name} now has enough. Record the purchase once you buy it.</p>
              <div className="flex justify-end"><button type="button" className="btn btn-primary" onClick={onDone}>Close</button></div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={onCancel}>{result.verdict === "yes" ? "Close" : "Not now"}</button>
              {result.sources.length > 0 && result.verdict !== "no" && (
                <button type="button" className="btn btn-primary" disabled={pending} onClick={apply}>{pending ? "Moving…" : result.verdict === "partly" ? "Move what I can" : "Apply this plan"}</button>
              )}
            </div>
          )}
        </div>
      )}
      {!result && error && <p role="alert" className="text-sm text-neg">{error}</p>}
    </div>
  );
}
