"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatCents } from "@/lib/utils/currency";
import { CountUp } from "@/components/count-up";
import { Hint } from "@/components/hint";
import type { CashView } from "@/lib/budget/funding";

interface View { cash: CashView; meId: string | null }
const Ctx = createContext<View | null>(null);

/** Where each account's money sits, and who looks after each account. Read by the pocket sheet and the Ready to assign number. */
export function useFunding(): View {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFunding must be used inside FundingProvider");
  return v;
}

export function FundingProvider({ cash, meId, children }: { cash: CashView; meId: string | null; children: ReactNode }) {
  const value = useMemo<View>(() => ({ cash, meId }), [cash, meId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export interface StewardShare { key: string; name: string; cents: number }

const sortShares = (m: Map<string, StewardShare>) => [...m.values()].filter((s) => s.cents > 0).sort((a, b) => b.cents - a.cents);

/** One pocket's money split by the steward of the account it came from. Older money with no account shows as "Not credited". */
export function pocketBySteward(cash: CashView, pocketId: string): StewardShare[] {
  const out = new Map<string, StewardShare>();
  for (const [acctKey, cents] of Object.entries(cash.byPocket[pocketId] ?? {})) {
    const a = cash.accounts.find((x) => x.id === acctKey);
    const key = a?.stewardId ?? "none";
    const cur = out.get(key) ?? { key, name: a?.stewardName ?? "Not credited", cents: 0 };
    cur.cents += cents; out.set(key, cur);
  }
  return sortShares(out);
}

/** Unassigned cash split by the steward of the account holding it. */
export function readyBySteward(cash: CashView): StewardShare[] {
  const out = new Map<string, StewardShare>();
  for (const a of cash.accounts) {
    const key = a.stewardId ?? "none";
    const cur = out.get(key) ?? { key, name: a.stewardName ?? "No steward", cents: 0 };
    cur.cents += a.readyCents; out.set(key, cur);
  }
  return sortShares(out);
}

/** True when more than one person looks after accounts, so splitting money by steward means something. */
export const hasSeveralStewards = (cash: CashView) => new Set(cash.accounts.map((a) => a.stewardId).filter(Boolean)).size > 1;

/** The big Ready to assign number, with who holds it underneath when two or more people have accounts. */
export function ReadyAmount({ rtaCents }: { rtaCents: number }) {
  const { cash } = useFunding();
  const split = hasSeveralStewards(cash) && rtaCents > 0 ? readyBySteward(cash) : [];
  return (
    <div className="flex flex-col">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
        {rtaCents < 0 ? "Over-assigned" : "Money in pool"}
        <Hint label={rtaCents < 0 ? "What does over-assigned mean?" : "What is the money in the pool?"}>
          {rtaCents < 0
            ? "You have given pockets more money than your accounts actually hold. Take some back from a pocket to fix it."
            : "The pool is money that has arrived but doesn't have a job yet. Give it a job by assigning it to your pockets."}
        </Hint>
      </span>
      <span className={`nums text-2xl font-bold leading-tight tracking-tight ${rtaCents < 0 ? "text-neg" : "text-pos"}`}><CountUp cents={rtaCents} /></span>
      {rtaCents < 0 && (() => {
        const over = cash.accounts.filter((a) => a.readyCents < 0).sort((a, b) => a.readyCents - b.readyCents);
        return (
          <span className="nums text-[11px] text-slate-600 dark:text-slate-300">
            {over.length > 0 ? `Assigned more than it holds: ${over.map((a) => `${a.name} ${formatCents(-a.readyCents)}`).join(" · ")}` : "You've assigned more than your accounts hold."}
            {" "}Release money from a pocket to fix it.
          </span>
        );
      })()}
      {split.length > 1 && <span className="nums text-[11px] text-slate-600 dark:text-slate-300">{split.map((s) => `${s.name} ${formatCents(s.cents)}`).join(" · ")}</span>}
    </div>
  );
}
