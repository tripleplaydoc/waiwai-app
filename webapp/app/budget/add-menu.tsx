"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronsDownUp, ChevronsUpDown, FolderPlus, Plus, Tag, Wallet } from "lucide-react";

export interface AddMenuProps {
  onPocket: () => void;
  onCategory: () => void;
  onTags: () => void;
  /** Only passed when there is more than one category to fold. */
  fold?: { allFolded: boolean; onToggle: () => void };
}

function Item({ icon, title, hint, kbd, onClick }: { icon: ReactNode; title: string; hint?: string; kbd?: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-slate-50 focus-visible:bg-slate-50 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
        {hint && <span className="block text-[11px] leading-tight text-slate-500 dark:text-slate-400">{hint}</span>}
      </span>
      {kbd && <span className="kbd hidden sm:inline-flex">{kbd}</span>}
    </button>
  );
}

/** One calm "+ Add" button that holds the less-used actions: new pocket, new category, tags, fold all. */
export function AddMenu({ onPocket, onCategory, onTags, fold }: AddMenuProps) {
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
  const run = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div ref={box} className="relative">
      <button type="button" className="btn btn-primary btn-sm !min-h-11 !px-4" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Plus className="size-4" aria-hidden /> Add
      </button>
      {open && (
        <div role="menu" aria-label="Add or organise" className="card absolute right-0 top-12 z-30 w-[min(86vw,18rem)] p-1.5 shadow-xl">
          <Item icon={<Wallet className="size-4" aria-hidden />} title="Pocket" hint="A place for money with a job" kbd="N" onClick={run(onPocket)} />
          <Item icon={<FolderPlus className="size-4" aria-hidden />} title="Category" hint="A group of pockets" onClick={run(onCategory)} />
          <div className="my-1 border-t border-[#E2E8F0] dark:border-slate-800" role="separator" />
          <Item icon={<Tag className="size-4" aria-hidden />} title="Tags" hint="Colour labels to filter pockets" onClick={run(onTags)} />
          {fold && (
            <Item
              icon={fold.allFolded ? <ChevronsUpDown className="size-4" aria-hidden /> : <ChevronsDownUp className="size-4" aria-hidden />}
              title={fold.allFolded ? "Expand all categories" : "Collapse all categories"} onClick={run(fold.onToggle)}
            />
          )}
        </div>
      )}
    </div>
  );
}
