"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { Modal } from "@/components/modal";
import { MoveForm, type MovePocket } from "@/components/move-money";

export const MOVE_EVENT = "waiwai:move-money";
export const openMoveMoney = (fromId?: string) => window.dispatchEvent(new CustomEvent(MOVE_EVENT, { detail: { fromId } }));

/** Button + modal host; any pocket's available pill can also open it via openMoveMoney(). */
export function MoveMoneyHost({ workspaceId, month, pockets }: { workspaceId: string; month: string; pockets: MovePocket[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<{ fromId?: string } | null>(null);
  useEffect(() => {
    const h = (e: Event) => setOpen({ fromId: (e as CustomEvent).detail?.fromId });
    window.addEventListener(MOVE_EVENT, h);
    return () => window.removeEventListener(MOVE_EVENT, h);
  }, []);
  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => setOpen({})}><ArrowRightLeft className="size-4" aria-hidden /> Move money</button>
      {open && (
        <Modal open onClose={() => setOpen(null)} title="Move money between pockets">
          <MoveForm workspaceId={workspaceId} month={month} pockets={pockets} initialFromId={open.fromId} onCancel={() => setOpen(null)} onDone={() => { setOpen(null); router.refresh(); }} />
        </Modal>
      )}
    </>
  );
}
