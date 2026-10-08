"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Wand2 } from "lucide-react";
import { autoAssignAction, setAssignedAction } from "@/app/actions/budget";

export function AssignedInput({ categoryId, month, initial, label }: { categoryId: string; month: string; initial: string; label: string }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  // Server data changed (after save / month change): show the saved value.
  useEffect(() => { setValue(initial); setError(undefined); }, [initial]);

  function commit() {
    if (value.trim() === initial) return;
    const fd = new FormData();
    fd.set("categoryId", categoryId);
    fd.set("month", month);
    fd.set("amount", value);
    start(async () => {
      const r = await setAssignedAction(fd);
      if (!r.ok) setError(r.error);
      else setError(undefined);
    });
  }

  return (
    <div className="inline-flex flex-col items-end md:w-full">
      <input
        ref={ref}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        title={error}
        inputMode="decimal"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setValue(initial); setError(undefined); e.currentTarget.blur(); }
        }}
        className={`input nums !min-h-11 w-28 !px-3 text-right md:w-full md:max-w-32 md:!px-4 ${error ? "!border-[#C9372C]" : ""}`}
      />
      {error && <span role="alert" className="mt-1 text-[11px] text-[#C9372C]">{error}</span>}
    </div>
  );
}

export function AutoAssignButton({ workspaceId, month }: { workspaceId: string; month: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("workspaceId", workspaceId);
          fd.set("month", month);
          start(async () => {
            const r = await autoAssignAction(fd);
            setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
          });
        }}
      >
        <Wand2 className="size-4" aria-hidden /> {pending ? "Assigning…" : "Auto-assign"}
      </button>
      {msg && <span role="status" className={`text-xs ${msg.ok ? "text-[#2E7D32]" : "text-[#C9372C]"}`}>{msg.text}</span>}
    </div>
  );
}
