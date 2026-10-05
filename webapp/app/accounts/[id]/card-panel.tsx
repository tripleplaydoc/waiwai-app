"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CreditCard, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/modal";
import { coverCardShortfallAction, payCardAction, saveCardTermsAction } from "@/app/actions/cards";
import { centsToInput, formatCents } from "@/lib/utils/currency";
import type { CardStatus } from "@/lib/budget/cards";

const Msg = ({ s }: { s: { ok: boolean; message?: string; error?: string } | undefined }) =>
  !s ? null : s.ok ? (s.message ? <p role="status" className="text-sm text-pos">{s.message}</p> : null) : <p role="alert" className="text-sm text-[#C9372C]">{s.error}</p>;

function PayDialog({ card, accounts, today, onClose }: { card: CardStatus; accounts: { id: string; name: string }[]; today: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(payCardAction, undefined);
  const [amount, setAmount] = useState(card.owedCents > 0 ? centsToInput(card.owedCents) : "");
  useEffect(() => { if (state?.ok) onClose(); }, [state, onClose]);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="cardId" value={card.id} />
      <div>
        <label htmlFor="pay-from" className="label">Pay from</label>
        <select id="pay-from" name="fromAccountId" className="input" defaultValue={accounts[0]?.id}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="pay-amt" className="label">Amount</label><input id="pay-amt" name="amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="input nums" placeholder="0.00" /></div>
        <div><label htmlFor="pay-date" className="label">Date</label><input id="pay-date" name="date" type="date" defaultValue={today} className="input" /></div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {card.owedCents > 0 && <button type="button" className="rounded-full border border-[#E2E8F0] px-3 py-2 dark:border-slate-700" onClick={() => setAmount(centsToInput(card.owedCents))}>Pay in full {formatCents(card.owedCents)}</button>}
        {card.minPaymentCents > 0 && <button type="button" className="rounded-full border border-[#E2E8F0] px-3 py-2 dark:border-slate-700" onClick={() => setAmount(centsToInput(card.minPaymentCents))}>Minimum {formatCents(card.minPaymentCents)}</button>}
      </div>
      <p className="text-xs text-slate-500">This moves money from your account to the card. It isn&apos;t spending, so none of your pockets change.</p>
      <Msg s={state} />
      <div className="flex justify-end gap-2 pt-1"><button type="button" className="btn" onClick={onClose}>Cancel <span className="kbd">Esc</span></button><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Record payment"}</button></div>
    </form>
  );
}

function CoverDialog({ card, pockets, onClose }: { card: CardStatus; pockets: { id: string; name: string; availableCents: number }[]; onClose: () => void }) {
  const [state, action, pending] = useActionState(coverCardShortfallAction, undefined);
  useEffect(() => { if (state?.ok) onClose(); }, [state, onClose]);
  const total = card.parts.reduce((s, p) => s + p.cents, 0);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="cardId" value={card.id} />
      <p className="text-sm">These pockets went over because of money spent on {card.name}:</p>
      <ul className="divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] text-sm dark:divide-slate-800 dark:border-slate-700">
        {card.parts.map((p) => <li key={p.categoryId} className="flex justify-between px-3 py-2"><span>{p.name}</span><span className="nums font-semibold text-neg">{formatCents(p.cents)}</span></li>)}
      </ul>
      <div>
        <label htmlFor="cover-src" className="label">Take {formatCents(total)} from</label>
        <select id="cover-src" name="source" className="input" defaultValue="RTA">
          <option value="RTA">Ready to Assign</option>
          {pockets.filter((p) => p.availableCents >= total && !card.parts.some((x) => x.categoryId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name} ({formatCents(p.availableCents)} available)</option>)}
        </select>
      </div>
      <Msg s={state} />
      <div className="flex justify-end gap-2 pt-1"><button type="button" className="btn" onClick={onClose}>Cancel <span className="kbd">Esc</span></button><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Covering…" : "Cover it"}</button></div>
    </form>
  );
}

export function CardPanel({ card, payFrom, pockets, today, wsQ }: { card: CardStatus; payFrom: { id: string; name: string }[]; pockets: { id: string; name: string; availableCents: number }[]; today: string; wsQ: string }) {
  const [dlg, setDlg] = useState<"pay" | "cover" | null>(null);
  const [terms, termsAction, termsPending] = useActionState(saveCardTermsAction, undefined);
  const short = card.shortCents > 0;
  return (
    <section className="card overflow-hidden" aria-label="Credit card status">
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-950/40">
        <CreditCard className="size-3.5 text-slate-500" aria-hidden />
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Card</h2>
      </div>
      <div className="space-y-3 p-4">
        {card.owedCents === 0 ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-pos"><CheckCircle2 className="size-4" aria-hidden /> Nothing owed on this card.</p>
        ) : !short ? (
          <p className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-pos" aria-hidden /><span>You owe <strong className="nums">{formatCents(card.owedCents)}</strong>, and <strong className="text-pos">all of it is set aside</strong> in your pockets.</span></p>
        ) : (
          <div className="space-y-1">
            <p className="flex items-start gap-2 text-sm"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-neg" aria-hidden /><span>You owe <strong className="nums">{formatCents(card.owedCents)}</strong>, but <strong className="nums text-neg">{formatCents(card.shortCents)}</strong> of it isn&apos;t set aside yet.</span></p>
            {card.parts.length > 0 && <p className="pl-6 text-xs text-slate-600 dark:text-slate-300">{card.parts.map((p) => `${p.name} is ${formatCents(p.cents)} over`).join(" · ")}</p>}
            {card.uncategorizedCents > 0 && <p className="pl-6 text-xs text-slate-600 dark:text-slate-300">{formatCents(card.uncategorizedCents)} of card spending has no pocket yet. Pick one for those transactions below.</p>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={() => setDlg("pay")} disabled={payFrom.length === 0}>Pay card</button>
          {card.parts.length > 0 && <button type="button" className="btn" onClick={() => setDlg("cover")}>Cover the {formatCents(card.parts.reduce((s, p) => s + p.cents, 0))}</button>}
          {card.owedCents > 0 && <Link href={`/holdings/payoff${wsQ}`} className="btn">Payoff plan</Link>}
        </div>
        <details className="rounded-xl border border-[#E2E8F0] dark:border-slate-700">
          <summary className="cursor-pointer px-3 py-3 text-sm font-semibold">Interest rate &amp; minimum payment{card.aprBps != null ? ` · ${card.aprBps / 100}%` : ""}</summary>
          <form action={termsAction} className="space-y-3 px-3 pb-3">
            <input type="hidden" name="cardId" value={card.id} />
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="card-rate" className="label">Interest rate (% per year)</label><input id="card-rate" name="rate" inputMode="decimal" defaultValue={card.aprBps != null ? String(card.aprBps / 100) : ""} className="input nums" placeholder="24.99" /></div>
              <div><label htmlFor="card-min" className="label">Minimum payment</label><input id="card-min" name="payment" inputMode="decimal" defaultValue={card.minPaymentCents ? centsToInput(card.minPaymentCents) : ""} className="input nums" placeholder="0.00" /></div>
            </div>
            <p className="text-xs text-slate-500">Used by the Debt payoff plan. When interest is charged, add it as spending in the “Interest &amp; fees” pocket so you can see what the debt costs.</p>
            <div className="flex items-center gap-3"><button type="submit" className="btn" disabled={termsPending}>{termsPending ? "Saving…" : "Save"}</button><Msg s={terms} /></div>
          </form>
        </details>
      </div>
      <Modal open={dlg === "pay"} onClose={() => setDlg(null)} title={`Pay ${card.name}`}>{dlg === "pay" && <PayDialog card={card} accounts={payFrom} today={today} onClose={() => setDlg(null)} />}</Modal>
      <Modal open={dlg === "cover"} onClose={() => setDlg(null)} title="Cover the shortfall">{dlg === "cover" && <CoverDialog card={card} pockets={pockets} onClose={() => setDlg(null)} />}</Modal>
    </section>
  );
}
