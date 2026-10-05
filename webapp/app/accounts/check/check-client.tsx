"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { checkBalanceAction, parkUnaccountedAction, type CheckResult } from "@/app/actions/checkpoints";
import { formatCents } from "@/lib/utils/currency";
import type { ProofSummary } from "@/lib/proof-math";

interface Row { id: string; name: string; type: string; balanceCents: number; liability: boolean; proof: ProofSummary }

export function CheckClient({ accounts, today, initialId }: { accounts: Row[]; today: string; initialId?: string }) {
  return (
    <ul className="space-y-3">
      {accounts.map((a) => <AccountCheck key={a.id} a={a} today={today} autoFocus={a.id === initialId} />)}
    </ul>
  );
}

function AccountCheck({ a, today, autoFocus }: { a: Row; today: string; autoFocus: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [res, setRes] = useState<CheckResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => { setMsg(null); setRes(await checkBalanceAction({ accountId: a.id, date, amount })); router.refresh(); });
  const park = (id: string) => start(async () => { const r = await parkUnaccountedAction(id); setMsg(r.ok ? r.message : r.error); if (r.ok) setRes(null); router.refresh(); });
  const tone = a.proof.state === "matched" ? "text-pos" : a.proof.state === "off" ? "text-neg" : a.proof.state === "stale" ? "text-warn" : "text-slate-500";
  const Icon = a.proof.state === "matched" ? CheckCircle2 : a.proof.state === "off" ? AlertTriangle : Clock;
  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{a.name}</p>
          <p className={`flex items-center gap-1.5 text-xs ${tone}`}><Icon className="size-3.5 shrink-0" aria-hidden /> {a.proof.label}</p>
        </div>
        <p className="nums shrink-0 text-right text-sm"><span className="block text-xs text-slate-500">App says</span><span className="font-semibold">{formatCents(a.liability ? -a.balanceCents : a.balanceCents)}</span></p>
      </div>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (amount.trim()) run(); }}>
        <label className="min-w-0 flex-1 basis-40 text-xs font-medium text-slate-600 dark:text-slate-300">
          {a.liability ? "Amount you owe, per bank" : "Balance per bank"}
          <input autoFocus={autoFocus} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="nums mt-1 h-12 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-base dark:border-slate-700 dark:bg-slate-900" />
        </label>
        <label className="basis-36 text-xs font-medium text-slate-600 dark:text-slate-300">
          As of
          <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-12 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-900" />
        </label>
        <button disabled={pending || !amount.trim()} className="h-12 min-w-24 rounded-xl bg-[#4F46E5] px-5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Checking…" : "Check"}</button>
      </form>
      {msg && <p role="status" className="mt-3 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">{msg}</p>}
      {res && !res.ok && <p role="alert" className="mt-3 text-sm text-neg">{res.error}</p>}
      {res && res.ok && (
        <div role="status" className={`mt-3 rounded-xl border p-3 text-sm ${res.diagnosis.state === "off" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"}`}>
          <p className="font-semibold">{res.diagnosis.headline}</p>
          <p className="nums mt-1 text-xs text-slate-600 dark:text-slate-300">Bank {formatCents(a.liability ? -res.bankCents : res.bankCents)} · App {formatCents(a.liability ? -res.appCents : res.appCents)}</p>
          {res.diagnosis.hints.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{res.diagnosis.hints.map((h) => <li key={h}>{h}</li>)}</ul>}
          {res.diagnosis.suspects.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Look at these first</p>
              <ul className="mt-1 divide-y divide-[#E2E8F0] dark:divide-slate-700">
                {res.diagnosis.suspects.map((s) => (
                  <li key={s.id} className="py-2">
                    <Link href={`/accounts/${a.id}`} className="flex justify-between gap-2 font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300"><span className="truncate">{s.payee || "(no payee)"}</span><span className="nums shrink-0">{formatCents(s.amountCents)}</span></Link>
                    <span className="text-xs text-slate-500">{s.date} · {s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {res.diagnosis.state === "off" && (
            <div className="mt-3 space-y-2">
              <button disabled={pending} onClick={() => park(res.checkpointId)} className="min-h-12 w-full rounded-xl border border-[#4F46E5] px-4 text-sm font-semibold text-[#4F46E5] disabled:opacity-50 dark:border-indigo-300 dark:text-indigo-300">
                {res.onBudget ? "Can't find it yet: park the difference in Unaccounted" : "Can't find it yet: adjust the balance to match"}
              </button>
              <p className="text-xs text-slate-500">{res.onBudget ? "This makes the app match the bank right now and puts the difference in an Unaccounted pocket where you can see it and clear it once you find the cause." : "This adds a clearly labelled adjustment so the balance matches."} Or fix the entries above and run Check again.</p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
