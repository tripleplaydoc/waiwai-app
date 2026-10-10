"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { undoMoveAction } from "@/app/actions/moves";

/** Undo for one move in the Money moves log. Asks once ("Undo this move?") so a stray tap can't change anything. */
export function UndoMoveButton({ workspaceId, moveKey, summary }: { workspaceId: string; moveKey: string; summary: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    start(async () => {
      const r = await undoMoveAction(workspaceId, moveKey);
      setResult(r.ok ? { ok: true, text: r.message ?? "Undone." } : { ok: false, text: r.error });
      setAsking(false);
      if (r.ok) router.refresh();
    });
  }

  if (result?.ok) return <p role="status" className="text-sm font-medium text-pos">{result.text}</p>;
  return (
    <div className="space-y-1.5">
      {asking ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Undo ${summary}?`}>
          <span className="text-sm font-medium">Undo this move?</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={run} disabled={pending}>{pending ? "Undoing…" : "Yes, undo"}</button>
          <button type="button" className="btn btn-sm" onClick={() => setAsking(false)} disabled={pending}>Keep it</button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => { setResult(null); setAsking(true); }} aria-label={`Undo: ${summary}`}><Undo2 className="size-4" aria-hidden /> Undo</button>
      )}
      {result && !result.ok && <p role="alert" className="max-w-prose text-sm text-neg">{result.text}</p>}
    </div>
  );
}
