"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** A small chip that opens a floating panel. Closes on outside click or Esc. Children render server-side. */
export function Popover({ label, icon, align = "left", children }: { label: ReactNode; icon?: ReactNode; align?: "left" | "right"; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
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
        <div role="dialog" className={`card absolute top-11 z-30 max-h-[70vh] w-[min(92vw,26rem)] overflow-y-auto p-3 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
          {children}
        </div>
      )}
    </div>
  );
}
