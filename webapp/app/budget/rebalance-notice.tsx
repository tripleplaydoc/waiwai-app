"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";
import { Hint } from "@/components/hint";
import { formatCents } from "@/lib/utils/currency";
import { rebalanceHeldInAction } from "@/app/actions/funding";
import { useFunding } from "./funding-view";

/**
 * Shown when an account's pockets add up to more than the account holds while another account has free cash.
 * One tap re-labels where that pocket money is held; no pocket amount changes.
 */
export function RebalanceNotice({ workspaceId }: { workspaceId: string }) {
  const { cash } = useFunding();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const over = cash.accounts.filter((a) => a.readyCents < 0).sort((a, b) => a.readyCents - b.readyCents);
  const free = cash.accounts.filter((a) => a.readyCents > 0).reduce((s, a) => s + a.readyCents, 0);
  if (msg) return <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-pos dark:border-emerald-900 dark:bg-emerald-950/40">{msg}</p>;
  if (over.length === 0 || free <= 0) return null;
  const owed = over.reduce((s, a) => s + -a.readyCents, 0);
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <span className="flex min-w-0 flex-1 basis-64 items-start gap-2">
        <Scale className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span><strong>{over.map((a) => a.name).join(", ")}</strong> {over.length === 1 ? "has" : "have"} {formatCents(owed)} less cash than your pockets say they hold, while other accounts have free cash. Rebalance fixes the &quot;Held in&quot; labels only; no pocket amount changes.</span>
        <Hint label="What does Rebalance do?">Each pocket remembers which bank account its money sits in. Rebalance just moves those labels so every account matches its real cash. Nothing is spent or moved at the bank, and no pocket gets more or less.</Hint>
      </span>
      <button type="button" disabled={pending} className="btn btn-sm !min-h-11"
        onClick={() => start(async () => { const r = await rebalanceHeldInAction(workspaceId); setMsg(r.ok ? r.message ?? "Done." : r.error); router.refresh(); })}>
        {pending ? "Rebalancing…" : "Rebalance"}
      </button>
    </div>
  );
}
