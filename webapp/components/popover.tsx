"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** A small chip that opens a floating panel. Closes on outside click or Esc. Children render server-side. */
export function Popover({ label, icon, align = "left", width = "w-[min(92vw,26rem)]", children }: { label: ReactNode; icon?: ReactNode; align?: "left" | "right"; width?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  // Keep the panel inside the screen: slide it left/right when the chip sits near an edge (phones).
  useLayoutEffect(() => {
    if (!open || !panel.current) { setShift(0); return; }
    const r = panel.current.getBoundingClientRect();
    const margin = 12, vw = document.documentElement.clientWidth;
    const base = r.left - shift; // where it would sit with no shift
    let next = 0;
    if (base + r.width > vw - margin) next = vw - margin - (base + r.width);
    if (base + next < margin) next = margin - base;
    if (Math.abs(next - shift) > 0.5) setShift(next);
  }, [open, shift]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("touchstart", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("touchstart", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}
        className="flex min-h-9 items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {icon}{label}
      </button>
      {open && (
        <div ref={panel} style={{ transform: shift ? `translateX(${shift}px)` : undefined }} role="dialog" className={`card absolute top-11 z-30 max-h-[70vh] ${width} overflow-y-auto p-3 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
          {children}
        </div>
      )}
    </div>
  );
}
