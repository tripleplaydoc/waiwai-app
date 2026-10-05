"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { PriceRefresher } from "@/components/price-refresher";
import { removePositionAction, saveCashAction, savePositionAction } from "@/app/actions/holding-detail";
import { centsToInput, formatCents } from "@/lib/utils/currency";
import { formatQuantity, formatUnitPrice } from "@/lib/prices/math";
import type { PositionVM } from "@/lib/reports/holding-meta";
import { Msg, Section, TimeAgo } from "./ui";

function PositionDialog({ accountId, kind, edit, onClose }: { accountId: string; kind: "CRYPTO" | "STOCK"; edit?: PositionVM; onClose: () => void }) {
  const [state, action, pending] = useActionState(savePositionAction, undefined);
  const [removing, startRemove] = useTransition();
  const [err, setErr] = useState<string>();
  useEffect(() => { if (state?.ok) onClose(); }, [state, onClose]);
  const coin = kind === "CRYPTO";
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="accountId" value={accountId} />
      {edit && <input type="hidden" name="positionId" value={edit.id} />}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="pos-sym" className="label">{coin ? "Coin symbol" : "Ticker"}</label>
          <input id="pos-sym" name="symbol" required maxLength={15} autoCapitalize="characters" autoComplete="off" defaultValue={edit?.symbol} className="input uppercase" placeholder={coin ? "BTC" : "VTI"} />
        </div>
        <div>
          <label htmlFor="pos-qty" className="label">{coin ? "How many coins" : "How many shares"}</label>
          <input id="pos-qty" name="quantity" required inputMode="decimal" defaultValue={edit ? formatQuantity(edit.quantity).replace(/,/g, "") : ""} className="input nums" placeholder={coin ? "0.5" : "10"} />
        </div>
      </div>
      <div>
        <label htmlFor="pos-cost" className="label">Total you paid <span className="font-normal text-slate-500">(optional, shows gain or loss)</span></label>
        <input id="pos-cost" name="cost" inputMode="decimal" defaultValue={edit?.costBasisCents != null ? centsToInput(edit.costBasisCents) : ""} className="input nums" placeholder="0.00" />
      </div>
      <p className="text-xs text-slate-500">{coin ? "Use the coin's symbol (BTC, ETH, SOL…)." : "Use the ticker (AAPL, VTI, VOO…). US-listed stocks, ETFs and funds."} The price is looked up automatically.</p>
      <Msg state={state} />
      {err && <p role="alert" className="text-sm text-[#C9372C]">{err}</p>}
      <div className="flex items-center gap-2 pt-1">
        {edit && (
          <button type="button" className="btn btn-sm" disabled={removing} aria-label="Remove"
            onClick={() => { if (!window.confirm(`Remove ${edit.symbol}?`)) return; startRemove(async () => { const r = await removePositionAction(edit.id); if (r.ok) onClose(); else setErr(r.error); }); }}>
            <Trash2 className="size-3.5" aria-hidden /> Remove
          </button>
        )}
        <button type="button" className="btn ml-auto" onClick={onClose}>Cancel <span className="kbd">Esc</span></button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

function CashDialog({ accountId, cashCents, onClose }: { accountId: string; cashCents: number; onClose: () => void }) {
  const [state, action, pending] = useActionState(saveCashAction, undefined);
  useEffect(() => { if (state?.ok) onClose(); }, [state, onClose]);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="accountId" value={accountId} />
      <div>
        <label htmlFor="cash-amt" className="label">Cash in this account (not invested)</label>
        <input id="cash-amt" name="cash" inputMode="decimal" defaultValue={cashCents ? centsToInput(cashCents) : ""} className="input nums" placeholder="0.00" />
      </div>
      <Msg state={state} />
      <div className="flex items-center gap-2 pt-1">
        <button type="button" className="btn ml-auto" onClick={onClose}>Cancel <span className="kbd">Esc</span></button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

export function PositionsSection({ accountId, workspaceId, kind, positions, cashCents }: { accountId: string; workspaceId: string; kind: "CRYPTO" | "STOCK"; positions: PositionVM[]; cashCents: number }) {
  const [dlg, setDlg] = useState<{ edit?: PositionVM } | "cash" | null>(null);
  const coin = kind === "CRYPTO";
  const oldest = positions.map((p) => p.priceAt).filter((t): t is string => !!t).sort()[0] ?? null;
  const source = [...new Set(positions.map((p) => p.priceSource).filter(Boolean))].join(", ");
  const total = positions.reduce((s, p) => s + p.valueCents, 0) + cashCents;
  return (
    <Section title={coin ? "Coins" : "Shares"} action={<PriceRefresher workspaceId={workspaceId} compact />}
      hint={positions.length === 0 ? (coin ? "Add each coin and how many you hold. WaiWai looks up the current price and keeps the value up to date." : "Add each stock, ETF or fund and how many shares you hold. WaiWai looks up the current price and keeps the value up to date.") : undefined}>
      <ul className="-mx-4 -mt-4 mb-3 divide-y divide-[#E2E8F0] dark:divide-slate-800">
        {positions.map((p) => {
          const gain = p.costBasisCents != null ? p.valueCents - p.costBasisCents : null;
          return (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.symbol}{p.name && <span className="ml-2 text-xs font-normal text-slate-500">{p.name}</span>}</div>
                <div className="nums truncate text-xs text-slate-500">
                  {formatQuantity(p.quantity)} × {p.price ? formatUnitPrice(p.price) : <span className="text-amber-600">no price yet</span>}
                </div>
              </div>
              <div className="shrink-0 text-right"><div className="nums text-[15px] font-bold">{formatCents(p.valueCents)}</div>{gain != null && <div className={`nums text-[11px] ${gain >= 0 ? "text-pos" : "text-neg"}`}>{gain >= 0 ? "▲" : "▼"} {formatCents(Math.abs(gain))}</div>}</div>
              <button type="button" className="btn btn-sm !min-h-10" aria-label={`Edit ${p.symbol}`} onClick={() => setDlg({ edit: p })}><Pencil className="size-3.5" aria-hidden /></button>
            </li>
          );
        })}
        {(cashCents > 0 || positions.length > 0) && (
          <li className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold">Cash</div><div className="text-xs text-slate-500">Not invested</div></div>
            <div className="nums shrink-0 text-right text-[15px] font-bold">{formatCents(cashCents)}</div>
            <button type="button" className="btn btn-sm !min-h-10" aria-label="Edit cash" onClick={() => setDlg("cash")}><Pencil className="size-3.5" aria-hidden /></button>
          </li>
        )}
      </ul>
      {positions.length === 0 && <div className="-mt-1 mb-3" />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={() => setDlg({})}><Plus className="size-4" aria-hidden /> Add {coin ? "a coin" : "a stock or fund"}</button>
        {positions.length > 0 && <div className="nums ml-auto text-right text-xs text-slate-500">Total <strong className="text-sm text-slate-900 dark:text-slate-100">{formatCents(total)}</strong></div>}
      </div>
      {positions.length > 0 && <p className="mt-3 text-[11px] text-slate-500">Prices from {source || "market data"} · <TimeAgo iso={oldest} prefix="updated " /></p>}
      <Modal open={dlg !== null && dlg !== "cash"} onClose={() => setDlg(null)} title={dlg && dlg !== "cash" && dlg.edit ? `Edit ${dlg.edit.symbol}` : coin ? "Add a coin" : "Add a stock or fund"}>
        {dlg !== null && dlg !== "cash" && <PositionDialog key={dlg.edit?.id ?? "new"} accountId={accountId} kind={kind} edit={dlg.edit} onClose={() => setDlg(null)} />}
      </Modal>
      <Modal open={dlg === "cash"} onClose={() => setDlg(null)} title="Cash in this account">
        {dlg === "cash" && <CashDialog accountId={accountId} cashCents={cashCents} onClose={() => setDlg(null)} />}
      </Modal>
    </Section>
  );
}
