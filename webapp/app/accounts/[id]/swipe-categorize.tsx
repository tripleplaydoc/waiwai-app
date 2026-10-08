"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Tag } from "lucide-react";
import { Modal } from "@/components/modal";
import { setTransactionCategoryAction } from "@/app/actions/transactions";
import { formatCents } from "@/lib/utils/currency";

export type PickerCategory = { id: string; name: string; group: string; type: "INCOME" | "EXPENSE" | "SYSTEM" };
type Target = { id: string; payee: string; amountCents: number; current: string };
const Ctx = createContext<((t: Target) => void) | null>(null);

/** One category picker for the whole list (so the category list is sent to the browser once, not once per row). */
export function CategoryPickerProvider({ categories, children }: { categories: PickerCategory[]; children: ReactNode }) {
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const open = useCallback((t: Target) => { setQ(""); setErr(undefined); setTarget(t); }, []);
  const close = useCallback(() => setTarget(null), []);
  const list = useMemo(() => {
    if (!target) return [];
    const inflow = target.amountCents > 0;
    const needle = q.trim().toLowerCase();
    return categories
      .filter((c) => (inflow ? true : c.type !== "INCOME") && (!needle || c.name.toLowerCase().includes(needle) || c.group.toLowerCase().includes(needle)))
      .sort((a, b) => (inflow ? Number(b.type === "INCOME") - Number(a.type === "INCOME") : 0));
  }, [categories, target, q]);
  const groups = [...new Set(list.map((c) => c.group))];
  const choose = (categoryId: string) => {
    if (!target) return;
    const fd = new FormData();
    fd.set("transactionId", target.id);
    fd.set("categoryId", categoryId);
    start(async () => {
      try { await setTransactionCategoryAction(fd); setTarget(null); router.refresh(); } catch { setErr("Could not save that. Please try again."); }
    });
  };
  return (
    <Ctx.Provider value={open}>
      {children}
      <Modal open={target !== null} onClose={close} title="Pick a category">
        {target && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300"><span className="font-semibold text-slate-900 dark:text-slate-100">{target.payee || "No payee"}</span> · <span className="nums">{formatCents(target.amountCents)}</span></p>
            <div>
              <label htmlFor="pick-q" className="sr-only">Search categories</label>
              <input id="pick-q" type="search" autoComplete="off" className="input" placeholder="Search categories" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {err && <p role="alert" className="text-sm text-neg">{err}</p>}
            <div className="space-y-3" aria-busy={pending}>
              {!q && (
                <button type="button" data-autofocus disabled={pending} onClick={() => choose("")} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[#E2E8F0] px-4 text-left text-sm dark:border-slate-700">
                  <span>No category yet</span>{target.current === "" && <Check className="size-4 text-pos" aria-label="Current" />}
                </button>
              )}
              {groups.map((g) => (
                <div key={g}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</p>
                  <ul className="space-y-1">
                    {list.filter((c) => c.group === g).map((c) => (
                      <li key={c.id}>
                        <button type="button" disabled={pending} onClick={() => choose(c.id)} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[#E2E8F0] px-4 text-left text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                          <span>{c.name}{c.type === "INCOME" ? <span className="text-slate-500"> (income)</span> : null}</span>{target.current === c.id && <Check className="size-4 text-pos" aria-label="Current" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {list.length === 0 && <p className="text-sm text-slate-500">No category matches.</p>}
            </div>
          </div>
        )}
      </Modal>
    </Ctx.Provider>
  );
}

const W = 104; // how far a row slides to show its action
type Gesture = { id: number; x0: number; y0: number; base: number; locked: "h" | "v" | null };

/**
 * A transaction card you can swipe sideways (touch or pen) to reveal a "Categorize" button.
 * Vertical scrolling is untouched (touch-action: pan-y). Without a gesture the same thing is one tap away
 * on the category menu inside the card, which is always visible.
 */
export function SwipeRow({ transactionId, payee, amountCents, current, canCategorize, search, uncategorized, className, children }: {
  transactionId: string; payee: string; amountCents: number; current: string; canCategorize: boolean; search: string; uncategorized: boolean; className?: string; children: ReactNode;
}) {
  const open = useContext(Ctx);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const g = useRef<Gesture | null>(null);
  const moved = useRef(false);
  const ref = useRef<HTMLElement>(null);
  const isOpen = x !== 0;

  useEffect(() => {
    if (!isOpen) return;
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setX(0); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setX(0); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [isOpen]);

  const down = (e: React.PointerEvent) => {
    if (!canCategorize || e.pointerType === "mouse" || !e.isPrimary) return;
    if ((e.target as HTMLElement).closest("select,input,textarea,a")) return;
    g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, base: x, locked: null };
    moved.current = false;
  };
  const move = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (s.locked === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.locked = Math.abs(dx) > Math.abs(dy) * 1.4 ? "h" : "v";
      if (s.locked === "h") { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable; the drag still works */ } setDragging(true); }
    }
    if (s.locked !== "h") return;
    moved.current = true;
    setX(Math.max(-W, Math.min(W, s.base + dx)));
  };
  const up = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    g.current = null;
    setDragging(false);
    if (s.locked === "h") setX((cur) => (cur <= -W / 2 ? -W : cur >= W / 2 ? W : 0));
  };
  const clickCapture = (e: React.MouseEvent) => {
    // A drag, or a tap on a card that is sliding closed, must not also press the button underneath.
    if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; return; }
    if (isOpen && !(e.target as HTMLElement).closest("[data-swipe-action]")) { e.preventDefault(); e.stopPropagation(); setX(0); }
  };
  const act = () => { setX(0); open?.({ id: transactionId, payee, amountCents, current }); };
  const action = (side: "l" | "r") => (
    <button type="button" data-swipe-action onClick={act}
      className={`absolute inset-y-0 flex w-[104px] flex-col items-center justify-center gap-0.5 bg-[#4F46E5] text-xs font-semibold text-white ${side === "l" ? "left-0" : "right-0"}`}>
      <Tag className="size-4" aria-hidden /> {current ? "Change" : "Categorize"}
    </button>
  );
  return (
    <article ref={ref} data-tx={transactionId} data-s={search} data-uncat={uncategorized ? "1" : "0"} className={`relative overflow-hidden ${className ?? ""}`}>
      {canCategorize && <>{x > 0 && action("l")}{x < 0 && action("r")}</>}
      <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClickCapture={clickCapture}
        style={{ transform: `translateX(${x}px)`, touchAction: canCategorize ? "pan-y" : undefined }}
        className={`relative space-y-2 bg-white px-4 py-3 dark:bg-slate-900 ${dragging ? "" : "transition-transform duration-200 motion-reduce:transition-none"}`}>
        {children}
      </div>
    </article>
  );
}
