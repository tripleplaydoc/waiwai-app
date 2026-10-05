"use client";

import { useEffect, useRef } from "react";
import { Sparkles, Waves } from "lucide-react";

export type Flow = "inflow" | "outflow";

export const AFFIRMATIONS: Record<Flow, string> = {
  inflow: "Thank you, thank you, thank you. I am a money magnet. Money, you are welcomed here!",
  outflow: "Thank you for flowing through. Go out and bless the lives of others, and return multiplied!",
};

/** Shown right after a transaction is saved. */
export function Affirmation({ flow, onDone, onAnother }: { flow: Flow; onDone: () => void; onAnother: () => void }) {
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => { done.current?.focus(); }, []);
  const inflow = flow === "inflow";
  return (
    <div role="status" aria-live="polite" className="space-y-5 py-2 text-center" data-testid="affirmation">
      <div className={`mx-auto flex size-16 items-center justify-center rounded-full ${inflow ? "bg-pos-soft text-pos" : "bg-blue-50 text-[#2E6BE6] dark:bg-blue-950"}`}>
        {inflow ? <Sparkles className="size-8" aria-hidden /> : <Waves className="size-8" aria-hidden />}
      </div>
      <p className="text-xl font-semibold leading-snug tracking-tight text-balance">{AFFIRMATIONS[flow]}</p>
      <p className="text-xs text-slate-500">{inflow ? "Saved as an inflow." : "Saved as an outflow."}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
        <button type="button" className="btn" onClick={onAnother}>Add another</button>
        <button ref={done} type="button" className="btn btn-primary" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
