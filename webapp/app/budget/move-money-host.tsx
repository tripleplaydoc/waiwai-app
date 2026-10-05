"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { Modal } from "@/components/modal";
import { AddForm, MoveForm, type MovePocket } from "@/components/move-money";
import { useCashLens } from "./cash-lens";

export const MOVE_EVENT = "waiwai:move-money";
type Tab = "add" | "move";
/** Opens the pocket money sheet: add to a pocket's assigned amount, or move money out of it. */
export const openMoveMoney = (fromId?: string, tab: Tab = "move") => window.dispatchEvent(new CustomEvent(MOVE_EVENT, { detail: { fromId, tab } }));

/** Button + modal host; any pocket's amount can also open it via openMoveMoney(). */
export function MoveMoneyHost({ workspaceId, month, pockets, readyToAssignCents, hideButton }: { workspaceId: string; month: string; pockets: MovePocket[]; readyToAssignCents: number; hideButton?: boolean }) {
  const router = useRouter();
  const { cash, account } = useCashLens();
  const [open, setOpen] = useState<{ fromId?: string; tab: Tab } | null>(null);
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail ?? {}; setOpen({ fromId: d.fromId, tab: d.tab === "add" ? "add" : "move" }); };
    window.addEventListener(MOVE_EVENT, h);
    return () => window.removeEventListener(MOVE_EVENT, h);
  }, []);
  const done = () => { setOpen(null); router.refresh(); };
  const tabCls = (on: boolean) => `min-h-11 flex-1 rounded-lg text-sm font-semibold ${on ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-600 dark:text-slate-300"}`;
  return (
    <>
      {!hideButton && <button type="button" className="btn btn-sm" onClick={() => setOpen({ tab: "move" })}><ArrowRightLeft className="size-4" aria-hidden /> Move money</button>}
      {open && (
        <Modal open onClose={() => setOpen(null)} title="Pocket money">
          <div role="tablist" aria-label="What to do" className="mb-3 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button type="button" role="tab" aria-selected={open.tab === "add"} className={tabCls(open.tab === "add")} onClick={() => setOpen({ ...open, tab: "add" })}>Add money</button>
            <button type="button" role="tab" aria-selected={open.tab === "move"} className={tabCls(open.tab === "move")} onClick={() => setOpen({ ...open, tab: "move" })}>Move money</button>
          </div>
          {open.tab === "add"
            ? <AddForm workspaceId={workspaceId} month={month} pockets={pockets} readyToAssignCents={readyToAssignCents} initialId={open.fromId} accounts={cash.accounts.map((a) => ({ id: a.id, name: a.name, readyCents: a.readyCents }))} initialAccountId={account} byPocket={cash.byPocket} onCancel={() => setOpen(null)} onDone={done} />
            : <MoveForm workspaceId={workspaceId} month={month} pockets={pockets} initialFromId={open.fromId} onCancel={() => setOpen(null)} onDone={done} />}
        </Modal>
      )}
    </>
  );
}
