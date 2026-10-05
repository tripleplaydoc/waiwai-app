"use client";

import { createContext, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Landmark } from "lucide-react";
import { Popover } from "@/components/popover";
import { tagUntaggedAction } from "@/app/actions/funding";
import { TransferButton } from "@/components/transfer-button";
import { formatCents } from "@/lib/utils/currency";
import type { CashView } from "@/lib/budget/funding";

const STORE = "waiwai:cash-lens";

interface Lens { cash: CashView; account: string | null; setAccount: (id: string | null) => void }
const Ctx = createContext<Lens | null>(null);

/** The account the budget is being viewed through (null = all accounts), plus where each account's money sits. */
export function useCashLens(): Lens {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCashLens must be used inside CashLensProvider");
  return v;
}

export function CashLensProvider({ cash, children }: { cash: CashView; children: ReactNode }) {
  const [account, setAccountState] = useState<string | null>(null);
  // Restore the last choice after mount (reading storage during render would mismatch the server HTML).
  useEffect(() => {
    try { const saved = localStorage.getItem(STORE); if (saved && cash.accounts.some((a) => a.id === saved)) setAccountState(saved); } catch { /* storage can be blocked */ }
  }, [cash.accounts]);
  const value = useMemo<Lens>(() => ({
    cash, account,
    setAccount: (id) => { setAccountState(id); try { if (id) localStorage.setItem(STORE, id); else localStorage.removeItem(STORE); } catch { /* ignore */ } },
  }), [cash, account]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The big Ready to assign number: all of it, or just the part sitting in the chosen account. */
export function ReadyAmount({ rtaCents }: { rtaCents: number }) {
  const { cash, account } = useCashLens();
  const acct = account ? cash.accounts.find((a) => a.id === account) : null;
  const cents = acct ? acct.readyCents : rtaCents;
  const label = acct ? `Ready to assign · ${acct.name}` : cents < 0 ? "Over-assigned" : "Ready to assign";
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">{label}</span>
      <span className={`nums text-2xl font-bold leading-tight tracking-tight ${cents < 0 ? "text-neg" : "text-pos"}`}>{formatCents(cents)}</span>
    </div>
  );
}

function diffText(diff: number): { text: string; tone: string } {
  if (Math.abs(diff) < 1) return { text: "Matches your budget", tone: "text-pos" };
  return diff > 0
    ? { text: `${formatCents(diff)} more in the bank than your budget holds here`, tone: "text-slate-600 dark:text-slate-300" }
    : { text: `${formatCents(-diff)} less in the bank than your budget expects here`, tone: "text-warn" };
}

/** The Cash chip and its "Where's my cash" panel. */
export function CashChip({ workspaceId, month, today }: { workspaceId: string; month: string; today: string }) {
  const { cash, account, setAccount } = useCashLens();
  const router = useRouter();
  const [tagTo, setTagTo] = useState(cash.accounts[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  if (cash.accounts.length === 0) return null;
  const picked = cash.accounts.find((a) => a.id === account);
  const totalReal = cash.accounts.reduce((s, a) => s + a.realCents, 0);

  const row = (key: string, title: string, big: number, detail: ReactNode, hint: { text: string; tone: string } | null, on: boolean, onPick: () => void) => (
    <li key={key}>
      <button type="button" aria-pressed={on} onClick={onPick}
        className={`w-full rounded-xl border px-3 py-2 text-left ${on ? "border-[#2E6BE6] bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40" : "border-[#E2E8F0] hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}>
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold">{title}</span>
          <span className="nums text-[15px] font-bold">{formatCents(big)}</span>
        </span>
        <span className="nums block text-xs text-slate-500">{detail}</span>
        {hint && <span className={`block text-[11px] ${hint.tone}`}>{hint.text}</span>}
      </button>
    </li>
  );

  return (
    <Popover
      icon={<Landmark className="size-3.5 text-[#2E6BE6]" aria-hidden />}
      label={picked ? <>Cash <span className="rounded-full bg-blue-50 px-1.5 text-[#1E4FBF] dark:bg-blue-950 dark:text-blue-300">{picked.name}</span></> : "Cash"}
    >
      <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Where&apos;s my cash</p>
      <p className="mb-2 text-xs text-slate-500">Pick an account to see the budget as that account&apos;s money: Ready to assign and every pocket show only what sits there.</p>
      <ul className="space-y-1.5">
        {row("all", "All accounts", totalReal, "Everything in the bank", null, account === null, () => setAccount(null))}
        {cash.accounts.map((a) =>
          row(a.id, a.name, a.realCents,
            <>Ready {formatCents(a.readyCents)} · Pockets {formatCents(a.pocketsCents)}</>,
            diffText(a.realCents - a.readyCents - a.pocketsCents), account === a.id, () => setAccount(a.id)))}
      </ul>
      <div className="mt-2"><TransferButton accounts={cash.accounts.map((a) => ({ id: a.id, name: a.name }))} today={today} className="btn btn-sm w-full" label="Move cash between accounts" /></div>
      {cash.cardsOwedCents > 0 && <p className="nums mt-2 text-xs text-slate-500">Credit cards owe {formatCents(cash.cardsOwedCents)}. Money spent on a card stays in the bank until you pay it.</p>}

      {cash.untaggedPocketCents > 0 && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-warn-soft p-3 dark:border-amber-700">
          <p className="text-xs font-semibold text-warn">{formatCents(cash.untaggedPocketCents)} in your pockets isn&apos;t tagged to an account yet.</p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">It was assigned before accounts were tracked. Tag all of it to one account here, or go pocket by pocket: tap a pocket&apos;s amount, then <strong>Where it is</strong>.</p>
          <div className="mt-2 flex gap-2">
            <select aria-label="Account to tag it to" className="input !min-h-10 flex-1" value={tagTo} onChange={(e) => setTagTo(e.target.value)}>
              {cash.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button type="button" className="btn btn-primary" disabled={pending || !tagTo}
              onClick={() => { setError(undefined); start(async () => { const r = await tagUntaggedAction(workspaceId, month, tagTo); if (r.ok) router.refresh(); else setError(r.error); }); }}>
              {pending ? "Tagging…" : "Tag it"}
            </button>
          </div>
          {error && <p role="alert" className="mt-1 text-xs text-neg">{error}</p>}
        </div>
      )}
    </Popover>
  );
}
