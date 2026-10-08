"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small "?" button that explains a term in plain words.
 * Usage: <Hint>The pool is money that has arrived but isn't given a job yet.</Hint>
 * Tap/click to open, tap again or press Esc / click outside to close. Touch target is 44px.
 */
export function Hint({ children, label = "What does this mean?" }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="-m-3 inline-flex h-11 w-11 items-center justify-center rounded-full">
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold leading-none text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">?</span>
      </button>
      {open && (
        <span role="tooltip" className="absolute left-1/2 top-full z-40 mt-2 w-64 max-w-[80vw] -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {children}
        </span>
      )}
    </span>
  );
}
