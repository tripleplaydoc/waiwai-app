"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A small "?" button that explains a term in plain words.
 * Usage: <Hint>The pool is money that has arrived but isn't given a job yet.</Hint>
 * The bubble is rendered at the top of the page (a portal) and kept inside the screen, so it is never
 * cut off by a card edge. Tap again, press Esc or tap elsewhere to close.
 */
export function Hint({ children, label = "What does this mean?" }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current || !bubble.current) { setPos(null); return; }
    const place = () => {
      if (!btn.current || !bubble.current) return;
      const b = btn.current.getBoundingClientRect();
      const w = bubble.current.offsetWidth, h = bubble.current.offsetHeight;
      const vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 12;
      const cx = b.left + b.width / 2;
      const left = Math.min(Math.max(cx - w / 2, m), vw - w - m);
      const below = b.bottom + 8 + h <= vh - m || b.top - 8 - h < m;
      const top = below ? b.bottom + 8 : b.top - 8 - h;
      setPos({ left, top: Math.max(m, top), arrow: Math.min(Math.max(cx - left, 14), w - 14) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) { if (e.key === "Escape") setOpen(false); return; }
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !bubble.current?.contains(t)) setOpen(false);
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
    <span className="inline-flex align-middle">
      <button ref={btn} type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="-m-3 inline-flex h-11 w-11 items-center justify-center rounded-full">
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold leading-none text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">?</span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={bubble} role="tooltip"
          style={{ position: "fixed", left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
          className="z-[100] w-72 max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-3.5 text-left text-[13px] font-normal normal-case leading-relaxed tracking-normal text-slate-700 shadow-xl dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
          {children}
        </div>,
        document.body,
      )}
    </span>
  );
}
