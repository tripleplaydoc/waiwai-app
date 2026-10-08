"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { Modal } from "@/components/modal";
import { AddForm, MoveForm, type MovePocket } from "@/components/move-money";
import { formatCents } from "@/lib/utils/currency";
import { hasSeveralStewards, pocketBySteward, useFunding } from "./funding-view";

export const MOVE_EVENT = "waiwai:move-money";
type Tab = "add" | "move";
/** Opens the pocket money sheet: add to a pocket's assigned amount, or move money out of it. */
export const openMoveMoney = (fromId?: string, tab: Tab = "move") => window.dispatchEvent(new CustomEvent(MOVE_EVENT, { detail: { fromId, tab } }));

/** Button + modal host; any pocket's amount can also open it via openMoveMoney(). */
export function MoveMoneyHost({ workspaceId, month, pockets, readyToAssignCents, hideButton }: { workspaceId: string; month: string; pockets: MovePocket[]; readyToAssignCents: number; hideButton?: boolean }) {
  const router = useRouter();
  const { cash, meId } = useFunding();
  const [open, setOpen] = useState<{ fromId?: string; tab: Tab } | null>(null);
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail ?? {}; setOpen({ fromId: d.fromId, tab: d.tab === "add" ? "add" : "move" }); };
    window.addEventListener(MOVE_EVENT, h);
    return () => window.removeEventListener(MOVE_EVENT, h);
  }, []);
  const accountList = cash.accounts.map((a) => ({ id: a.id, name: a.name, readyCents: a.readyCents, stewardName: hasSeveralStewards(cash) ? a.stewardName : null }));
  // Start on one of your own accounts that has cash, so the money is credited to you; "Any account" otherwise.
  const myAccount = cash.accounts.filter((a) => a.stewardId === meId && a.readyCents > 0).sort((x, y) => y.readyCents - x.readyCents)[0]?.id ?? null;
  const thisPocket = open?.fromId ? pockets.find((p) => p.id === open.fromId) : undefined;
  // Start where the pocket belongs: its own "Paid from" account, else the account it has been funded from most, else your biggest account.
  const homeId = thisPocket?.paidFromId ?? null;
  const usualId = thisPocket ? Object.entries(cash.byPocket[thisPocket.id] ?? {}).sort((x, y) => y[1] - x[1]).map(([k]) => k)[0] ?? null : null;
  const hasCash = (id: string | null) => !!id && cash.accounts.some((a) => a.id === id && a.readyCents > 0);
  const startAccount = hasCash(homeId) ? homeId : hasCash(usualId) ? usualId : myAccount;
  const funded = thisPocket && hasSeveralStewards(cash) ? pocketBySteward(cash, thisPocket.id) : [];
  const done = () => { setOpen(null); router.refresh(); };
  const tabCls = (on: boolean) => `min-h-11 flex-1 rounded-lg text-sm font-semibold ${on ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-600 dark:text-slate-300"}`;
  return (
    <>
      {!hideButton && <button type="button" className="btn btn-sm" onClick={() => setOpen({ tab: "move" })}><ArrowRightLeft className="size-4" aria-hidden /> Move money</button>}
      {open && (
        <Modal open onClose={() => setOpen(null)} title="Pocket money">
          {!thisPocket?.system && <div role="tablist" aria-label="What to do" className="mb-3 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button type="button" role="tab" aria-selected={open.tab === "add"} className={tabCls(open.tab === "add")} onClick={() => setOpen({ ...open, tab: "add" })}>Add money</button>
            <button type="button" role="tab" aria-selected={open.tab === "move"} className={tabCls(open.tab === "move")} onClick={() => setOpen({ ...open, tab: "move" })}>Move money</button>
          </div>}
          {funded.length > 0 && (
            <p className="nums mb-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{thisPocket!.name} was funded by</span>{" "}
              {funded.map((f) => `${f.name} ${formatCents(f.cents)}`).join(" · ")}
            </p>
          )}
          {open.tab === "add" || thisPocket?.system
            ? <AddForm workspaceId={workspaceId} month={month} pockets={pockets} readyToAssignCents={readyToAssignCents} initialId={open.fromId} accounts={accountList} initialAccountId={startAccount} onCancel={() => setOpen(null)} onDone={done} />
            : <MoveForm workspaceId={workspaceId} month={month} pockets={pockets} initialFromId={open.fromId} onCancel={() => setOpen(null)} onDone={done} />}
        </Modal>
      )}
    </>
  );
}
