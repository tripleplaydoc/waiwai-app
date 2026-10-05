"use client";

import { useActionState } from "react";
import { saveAssetInfoAction } from "@/app/actions/holding-detail";
import { centsToInput, formatCents } from "@/lib/utils/currency";
import type { MetaVM } from "@/lib/reports/holding-meta";
import { Msg, Section } from "./ui";

export function AssetInfoSection({ accountId, meta, valueCents, loans, hidePurchase }: { accountId: string; meta: MetaVM; valueCents: number; loans: { id: string; name: string; owedCents: number }[]; hidePurchase?: boolean }) {
  const [state, action, pending] = useActionState(saveAssetInfoAction, undefined);
  const gain = meta.costBasisCents != null && !hidePurchase ? valueCents - meta.costBasisCents : null;
  const loan = loans.find((l) => l.id === meta.linkedLoanId);
  return (
    <Section title="More about it">
      {(gain != null || loan) && (
        <div className="mb-4 grid grid-cols-2 gap-3 text-center">
          {gain != null && (
            <div className="rounded-xl border border-[#E2E8F0] px-2 py-2 dark:border-slate-700">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{gain >= 0 ? "Gain" : "Loss"}</div>
              <div className={`nums text-base font-bold ${gain >= 0 ? "text-pos" : "text-neg"}`}>{gain >= 0 ? "▲" : "▼"} {formatCents(Math.abs(gain))}</div>
              {meta.costBasisCents! > 0 && <div className="nums text-[11px] text-slate-500">{((gain / meta.costBasisCents!) * 100).toFixed(1)}% on {formatCents(meta.costBasisCents!)}</div>}
            </div>
          )}
          {loan && (
            <div className="rounded-xl border border-[#E2E8F0] px-2 py-2 dark:border-slate-700">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Equity</div>
              <div className={`nums text-base font-bold ${valueCents - loan.owedCents < 0 ? "text-neg" : "text-pos"}`}>{formatCents(valueCents - loan.owedCents)}</div>
              <div className="nums text-[11px] text-slate-500">{valueCents > 0 ? `${Math.max(0, Math.round(((valueCents - loan.owedCents) / valueCents) * 100))}% owned` : ""} · owe {formatCents(loan.owedCents)}</div>
            </div>
          )}
        </div>
      )}
      <form action={action} className="space-y-3">
        <input type="hidden" name="accountId" value={accountId} />
        {!hidePurchase && (
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="ai-cost" className="label">What you paid</label><input id="ai-cost" name="cost" inputMode="decimal" defaultValue={meta.costBasisCents != null ? centsToInput(meta.costBasisCents) : ""} className="input nums" placeholder="0.00" /></div>
            <div><label htmlFor="ai-date" className="label">Bought on</label><input id="ai-date" name="purchaseDate" type="date" defaultValue={meta.purchaseDate ?? ""} className="input" /></div>
          </div>
        )}
        {hidePurchase && <input type="hidden" name="cost" value={meta.costBasisCents != null ? centsToInput(meta.costBasisCents) : ""} />}
        {hidePurchase && <input type="hidden" name="purchaseDate" value={meta.purchaseDate ?? ""} />}
        {loans.length > 0 && (
          <div>
            <label htmlFor="ai-loan" className="label">Loan against it <span className="font-normal text-slate-500">(to show your equity)</span></label>
            <select id="ai-loan" name="linkedLoanId" defaultValue={meta.linkedLoanId ?? ""} className="input">
              <option value="">None</option>
              {loans.map((l) => <option key={l.id} value={l.id}>{l.name} ({formatCents(l.owedCents)})</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="ai-notes" className="label">Notes</label>
          <textarea id="ai-notes" name="notes" rows={3} maxLength={2000} defaultValue={meta.notes ?? ""} className="input" placeholder="Account numbers to look up, insurance policy, where the title is kept…" />
        </div>
        <div className="flex items-center gap-3"><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button><Msg state={state} /></div>
      </form>
    </Section>
  );
}
