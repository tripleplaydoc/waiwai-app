"use client";

import { useRef, useState, useTransition } from "react";

/**
 * Click the text to edit it in place. Enter or clicking away saves, Esc cancels.
 */
export function InlineName({ value, onSave, disabled, label, className = "", inputClassName = "" }: {
  value: string; onSave: (name: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  disabled?: boolean; label: string; className?: string; inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const cancelled = useRef(false);

  if (disabled) return <span className={className}>{value}</span>;

  function commit() {
    if (cancelled.current) { cancelled.current = false; return; }
    const next = draft.trim();
    if (next === value || next === "") { setEditing(false); setError(undefined); setDraft(value); return; }
    start(async () => {
      const r = await onSave(next);
      if (r.ok) { setEditing(false); setError(undefined); }
      else setError(r.error);
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        title="Click to rename"
        aria-label={`${label}: ${value}. Click to rename`}
        onClick={() => { setDraft(value); setError(undefined); setEditing(true); }}
        className={`rounded-md px-1 -mx-1 text-left hover:bg-slate-900/5 focus-visible:bg-slate-900/5 dark:hover:bg-white/10 ${className}`}
      >
        {value}
      </button>
    );
  }
  return (
    <span className="inline-flex min-w-0 flex-col">
      <input
        autoFocus
        aria-label={`Rename ${value}`}
        aria-invalid={error ? true : undefined}
        value={draft}
        maxLength={80}
        disabled={pending}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === "Escape") { e.preventDefault(); cancelled.current = true; setEditing(false); setDraft(value); setError(undefined); }
        }}
        className={`min-h-9 w-full min-w-0 rounded-lg border border-[#2E6BE6] bg-white px-2 text-sm font-medium text-slate-900 outline-none ring-4 ring-blue-500/15 dark:bg-slate-950 dark:text-slate-100 ${error ? "!border-[#C9372C]" : ""} ${inputClassName}`}
      />
      {error && <span role="alert" className="mt-0.5 text-[11px] text-neg">{error}</span>}
    </span>
  );
}
