"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { removeLoanFromBudgetAction, saveLoanAction } from "@/app/actions/loans";
import { centsToInput, formatCents, parseToCents } from "@/lib/utils/currency";
import { loanDueIso, paymentsFor, suggestPayment } from "@/lib/loans";
import { shortDate } from "@/lib/budget/bills";
import type { AssetChoice, LoanVM, PocketChoice } from "@/lib/budget/loans-types";

type Group = { id: string; name: string };
type Bank = { id: string; name: string };

function LoanDialog({ open, onClose, workspaceId, loan, groups, defaultGroupId, banks, assets, pockets }: { open: boolean; onClose: () => void; workspaceId: string; loan: LoanVM | null; groups: Group[]; defaultGroupId: string; banks: Bank[]; assets: AssetChoice[]; pockets: PocketChoice[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveLoanAction, undefined);
  const [name, setName] = useState(loan?.name ?? "");
  const [mode, setMode] = useState<"now" | "start">("now");
  // "Where it stands now": balance owed, payments left, next due date. "From the start": original amount, count, first due date.
  const [balance, setBalance] = useState(loan?.balanceOwedCents ? centsToInput(loan.balanceOwedCents) : "");
  const [left, setLeft] = useState(loan?.onBudget && loan.paymentsLeft ? String(loan.paymentsLeft) : "");
  const [next, setNext] = useState(loan?.onBudget ? loan.nextDueIso ?? "" : "");
  const [original, setOriginal] = useState(loan?.originalCents ? centsToInput(loan.originalCents) : "");
  const [count, setCount] = useState(loan?.numPayments ? String(loan.numPayments) : "");
  const [first, setFirst] = useState(loan?.firstDueIso ?? "");
  const [payment, setPayment] = useState(loan?.paymentCents ? centsToInput(loan.paymentCents) : "");
  const [rate, setRate] = useState(loan && loan.aprBps ? String(loan.aprBps / 100) : "");
  const [pocketId, setPocketId] = useState("");
  const [removing, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string>();
  useEffect(() => { if (state?.ok) { onClose(); router.refresh(); } }, [state, onClose, router]);

  const apr = Math.round(Number(rate.replace(/%/g, "") || 0) * 100);
  const pay = parseToCents(payment);
  const bal = parseToCents(balance), orig = parseToCents(original);
  const nIn = Math.round(Number(mode === "now" ? left : count));
  const nGiven = Number.isInteger(nIn) && nIn > 0;
  const baseCents = mode === "now" ? bal : orig;
  const suggested = baseCents && baseCents > 0 && nGiven ? suggestPayment(baseCents, nGiven ? nIn : 0, apr) : 0;
  const effPay = pay && pay > 0 ? pay : suggested;
  const est = mode === "now" && !nGiven && bal && bal > 0 && effPay > 0 ? paymentsFor(bal, effPay, apr) : null;
  const n = nGiven ? nIn : est ?? 0;
  const anchor = mode === "now" ? next : first;
  const last = /^\d{4}-\d{2}-\d{2}$/.test(anchor) && n > 0 ? loanDueIso(anchor, n - 1) : null;
  const total = effPay && n ? effPay * n : 0;

  return (
    <Modal open={open} onClose={onClose} title={loan ? (loan.onBudget ? `Edit ${loan.name}` : `Put ${loan.name} on the budget`) : "Add a loan"}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        {loan && <input type="hidden" name="accountId" value={loan.accountId} />}
        <div>
          <label htmlFor="ln-name" className="label">Loan name</label>
          <input id="ln-name" name="name" required maxLength={80} className="input" placeholder="Affirm - Priceline" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div role="tablist" aria-label="What you know" className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {([["now", "Where it stands now"], ["start", "From the start"]] as const).map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={`min-h-10 flex-1 rounded-lg text-sm font-semibold ${mode === m ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-600 dark:text-slate-300"}`}>{label}</button>
          ))}
        </div>
        <input type="hidden" name="mode" value={mode} />
        {mode === "now" ? (
          <>
            <p className="text-xs text-slate-500">Already partway through? You don&apos;t need the original amount. Enter what you owe today and when the next payment is due. If you don&apos;t know how many payments are left, leave it blank and it&apos;s worked out from the balance and payment.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ln-bal" className="label">Balance still owed</label>
                <input id="ln-bal" name="balance" inputMode="decimal" className="input nums" placeholder="0.00" value={balance} onChange={(e) => setBalance(e.target.value)} />
              </div>
              <div>
                <label htmlFor="ln-left" className="label">Payments left <span className="font-normal text-slate-400">(optional)</span></label>
                <input id="ln-left" name="numPayments" inputMode="numeric" className="input nums" placeholder={est ? `about ${est}` : "4"} value={left} onChange={(e) => setLeft(e.target.value)} />
              </div>
              <div>
                <label htmlFor="ln-pay" className="label">Payment each month</label>
                <input id="ln-pay" name="payment" inputMode="decimal" className="input nums" placeholder={suggested ? centsToInput(suggested) : "0.00"} value={payment} onChange={(e) => setPayment(e.target.value)} />
              </div>
              <div>
                <label htmlFor="ln-rate" className="label">Interest rate <span className="font-normal text-slate-400">(% a year)</span></label>
                <input id="ln-rate" name="rate" inputMode="decimal" className="input nums" placeholder="0" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="ln-next" className="label">Next payment due</label>
              <input id="ln-next" name="firstDue" type="date" required className="input" value={next} onChange={(e) => setNext(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">If this month&apos;s payment is already made, use next month&apos;s date. Later payments fall on the same day each month. Come back and edit this any time the numbers drift from your lender&apos;s.</p>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ln-orig" className="label">Loan amount</label>
                <input id="ln-orig" name="original" inputMode="decimal" className="input nums" placeholder="0.00" value={original} onChange={(e) => setOriginal(e.target.value)} />
              </div>
              <div>
                <label htmlFor="ln-count" className="label">Number of payments</label>
                <input id="ln-count" name="numPayments" required inputMode="numeric" className="input nums" placeholder="6" value={count} onChange={(e) => setCount(e.target.value)} />
              </div>
              <div>
                <label htmlFor="ln-pay" className="label">Payment each month</label>
                <input id="ln-pay" name="payment" inputMode="decimal" className="input nums" placeholder={suggested ? centsToInput(suggested) : "0.00"} value={payment} onChange={(e) => setPayment(e.target.value)} />
              </div>
              <div>
                <label htmlFor="ln-rate" className="label">Interest rate <span className="font-normal text-slate-400">(% a year)</span></label>
                <input id="ln-rate" name="rate" inputMode="decimal" className="input nums" placeholder="0" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="ln-first" className="label">First payment due</label>
              <input id="ln-first" name="firstDue" type="date" required className="input" value={first} onChange={(e) => setFirst(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Later payments fall on the same day each month. For a loan you already started, use its original first due date and the paid-off payments are counted for you.</p>
            </div>
          </>
        )}
        {assets.length > 0 && (
          <div>
            <label htmlFor="ln-asset" className="label">Secured by <span className="font-normal text-slate-400">(car, home… anything you could sell)</span></label>
            <select id="ln-asset" name="securedById" className="input" defaultValue={loan?.securedBy?.id ?? ""}>
              <option value="">Nothing, this loan isn&apos;t tied to an asset</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.name}{a.otherLoan && a.otherLoan !== loan?.name ? ` (now tied to ${a.otherLoan})` : ""}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">Tying them shows your equity (what it&apos;s worth minus what you owe) on the asset and in net worth. Add the car, home or other asset under Assets &amp; liabilities first if it isn&apos;t listed.</p>
          </div>
        )}
        {!loan?.onBudget && pockets.length > 0 && (
          <div>
            <label htmlFor="ln-pocket" className="label">Pocket</label>
            <select id="ln-pocket" name="pocketId" className="input" value={pocketId} onChange={(e) => setPocketId(e.target.value)}>
              <option value="">Make a new pocket for this loan</option>
              {[...new Set(pockets.map((p) => p.group))].map((g) => (
                <optgroup key={g} label={g}>{pockets.filter((p) => p.group === g).map((p) => <option key={p.id} value={p.id}>Use {p.name}</option>)}</optgroup>
              ))}
            </select>
            {pocketId && <p className="mt-1 text-xs text-slate-500">That pocket keeps its name, category and money. Its monthly target becomes the payment above and it gets the due date.</p>}
          </div>
        )}
        {loan?.onBudget && loan.pocketName && <p className="text-xs text-slate-500">Paid from the pocket <strong className="font-semibold text-slate-700 dark:text-slate-200">{loan.pocketName}</strong>.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {!pocketId && (
          <div>
            <label htmlFor="ln-group" className="label">Budget category</label>
            <select id="ln-group" name="groupId" className="input" defaultValue={loan?.groupId ?? defaultGroupId}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value="__new">Loans &amp; payments</option>
            </select>
          </div>
          )}
          {banks.length > 1 && (
            <div>
              <label htmlFor="ln-from" className="label">Paid from</label>
              <select id="ln-from" name="paidFromId" className="input" defaultValue={loan?.paidFromId ?? ""}>
                <option value="">Any account</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {effPay > 0 && n > 0 && (
          <p className="nums rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {est && !nGiven ? "About " : ""}{n} payment{n === 1 ? "" : "s"} {mode === "now" ? "left " : ""}of <strong>{formatCents(effPay)}</strong>{last && <> · last one {shortDate(last)} {last.slice(0, 4)}</>} · {formatCents(total)} to pay
            {mode === "start" && orig && orig > 0 && total > orig && <> · about {formatCents(total - orig)} interest or fees</>}
            {mode === "now" && bal && bal > 0 && total > bal && <> · about {formatCents(total - bal)} of that is interest or fees</>}
            {!(pay && pay > 0) && " (payment worked out for you)"}
          </p>
        )}
        {state && !state.ok && <p role="alert" className="text-sm text-neg">{state.error}</p>}
        {removeError && <p role="alert" className="text-sm text-neg">{removeError}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {loan?.onBudget && (
            <button type="button" className="btn mr-auto" disabled={removing} onClick={() => startRemove(async () => { const r = await removeLoanFromBudgetAction(workspaceId, loan.accountId); if (r.ok) { onClose(); router.refresh(); } else setRemoveError(r.error); })}>Take off budget</button>
          )}
          <button type="button" className="btn" onClick={onClose}>Cancel <span className="kbd">Esc</span></button>
          <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : loan?.onBudget ? "Save" : "Put on budget"}</button>
        </div>
      </form>
    </Modal>
  );
}

function dueText(l: LoanVM): string {
  if (l.phase === "finished") return "Paid off";
  if (l.paidThisMonth && l.nextDueIso) return `Paid this month · next ${shortDate(l.nextDueIso)}`;
  if (l.overdue && l.nextDueIso) return `Ready for you · was due ${shortDate(l.nextDueIso)}`;
  if (l.nextDueIso) return `Due ${shortDate(l.nextDueIso)}`;
  return "";
}

/** The budget's Loans panel: every loan with its payment, due date and payments left, plus add / set up. */
export function LoansPanel({ workspaceId, loans, groups, defaultGroupId, banks, assets, pockets }: { workspaceId: string; loans: LoanVM[]; groups: Group[]; defaultGroupId: string; banks: Bank[]; assets: AssetChoice[]; pockets: PocketChoice[] }) {
  const [dialog, setDialog] = useState<{ loan: LoanVM | null } | null>(null);
  const live = loans.filter((l) => l.onBudget && l.phase !== "finished");
  const done = loans.filter((l) => l.phase === "finished");
  const unset = loans.filter((l) => !l.onBudget && l.phase !== "finished");
  const monthly = live.filter((l) => l.phase === "active").reduce((s, l) => s + l.paymentCents, 0);
  const owedTotal = live.reduce((s, l) => s + l.remainingCents, 0);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100"><Landmark className="size-4 text-[#2E6BE6]" aria-hidden /> Loans</span>
        <button type="button" className="btn btn-sm" onClick={() => setDialog({ loan: null })}><Plus className="size-4" aria-hidden /> Add loan</button>
      </div>
      {live.length > 0 && <p className="nums mb-2 text-xs text-slate-500">{formatCents(monthly)} a month · {formatCents(owedTotal)} left to pay in all</p>}
      {live.length === 0 && unset.length === 0 && done.length === 0 && <p className="text-xs text-slate-500">No loans yet. Add one with its amount, number of payments and due date, and its payment shows up in Bills.</p>}
      <ul className="space-y-1.5">
        {live.map((l) => (
          <li key={l.accountId} className="rounded-xl border border-[#E2E8F0] px-3 py-2 dark:border-slate-700">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{l.name}</p>
                <p className={`nums text-xs ${l.overdue ? "font-semibold text-indigo-700 dark:text-indigo-300" : "text-slate-500"}`}>{formatCents(l.paymentCents)} · {dueText(l)}</p>
              </div>
              <button type="button" className="btn btn-sm !px-2" aria-label={`Edit ${l.name}`} onClick={() => setDialog({ loan: l })}><Pencil className="size-3.5" aria-hidden /></button>
            </div>
            {l.securedBy && (
              <p className="nums mt-1 text-[11px] text-slate-500">
                Secured by <strong className="font-semibold text-slate-700 dark:text-slate-200">{l.securedBy.name}</strong> · worth {formatCents(l.securedBy.valueCents)} · equity{" "}
                <span className={l.securedBy.valueCents - l.balanceOwedCents < 0 ? "font-semibold text-neg" : "font-semibold text-pos"}>{formatCents(l.securedBy.valueCents - l.balanceOwedCents)}</span>
              </p>
            )}
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="presentation">
              <div className="h-full rounded-full bg-pos" style={{ width: `${Math.round((l.paymentsDone / Math.max(1, l.numPayments ?? 1)) * 100)}%` }} />
            </div>
            <p className="nums mt-1 text-[11px] text-slate-500">
              {l.phase === "upcoming" ? `Next ${shortDate(l.firstDueIso!)} · ` : l.paymentsDone > 0 ? `${l.paymentsDone} of ${l.numPayments} paid · ` : ""}
              {l.paymentsLeft} left ({formatCents(l.remainingCents)})
              {l.lastDueIso && <> · last {shortDate(l.lastDueIso)} {l.lastDueIso.slice(0, 4)}</>}
            </p>
          </li>
        ))}
      </ul>
      {unset.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Not on the budget yet</p>
          <ul className="space-y-1.5">
            {unset.map((l) => (
              <li key={l.accountId} className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-[#E2E8F0] px-3 py-2 dark:border-slate-700">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="nums text-xs text-slate-500">{l.paymentCents > 0 ? `${formatCents(l.paymentCents)} a month · ` : ""}owes {formatCents(l.balanceOwedCents)}</p>
                </div>
                <button type="button" className="btn btn-sm shrink-0" onClick={() => setDialog({ loan: l })}>Set up</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {done.length > 0 && <p className="mt-2 text-xs text-slate-500">{done.length} paid off: {done.map((l) => l.name).join(", ")}</p>}
      {dialog && <LoanDialog key={dialog.loan?.accountId ?? "new"} open onClose={() => setDialog(null)} workspaceId={workspaceId} loan={dialog.loan} groups={groups} defaultGroupId={defaultGroupId} banks={banks} assets={assets} pockets={pockets} />}
    </div>
  );
}
