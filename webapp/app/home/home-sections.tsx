"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, SlidersHorizontal } from "lucide-react";
import { resetHomeLayoutAction, saveHomeLayoutAction } from "@/app/actions/home-layout";
import { homeLabel, type HomeLayout } from "@/lib/home-layout";

/** Home sections in the person's order, with a Customize panel to drag them around or hide the ones they do not want. */
export function HomeSections({ nodes, layout }: { nodes: Record<string, ReactNode>; layout: HomeLayout }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState(layout.order);
  const [hidden, setHidden] = useState(layout.hidden);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const open = () => { setOrder(layout.order); setHidden(layout.hidden); setErr(undefined); setEditing(true); };
  const onEnd = (e: DragEndEvent) => { if (e.over && e.active.id !== e.over.id) setOrder((o) => arrayMove(o, o.indexOf(String(e.active.id)), o.indexOf(String(e.over!.id)))); };
  const move = (id: string, d: -1 | 1) => setOrder((o) => { const i = o.indexOf(id), j = i + d; return j < 0 || j >= o.length ? o : arrayMove(o, i, j); });
  const toggle = (id: string) => setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  const save = () => start(async () => { const r = await saveHomeLayoutAction(order, hidden); if (r.ok) { setEditing(false); router.refresh(); } else setErr(r.error); });
  const reset = () => start(async () => { const r = await resetHomeLayoutAction(); if (r.ok) { setEditing(false); router.refresh(); } else setErr(r.error); });

  return (
    <>
      {layout.order.filter((id) => !layout.hidden.includes(id) && nodes[id] != null && nodes[id] !== false).map((id) => <div key={id}>{nodes[id]}</div>)}

      {!editing ? (
        <button type="button" onClick={open} className="mx-auto flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <SlidersHorizontal className="size-4" aria-hidden /> Customize Home
        </button>
      ) : (
        <section className="card space-y-3 p-4" aria-label="Customize Home">
          <div>
            <h2 className="text-base font-bold">Customize Home</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">Drag to reorder (or use the arrows). Tap the eye to hide a section. Nothing is deleted; you can bring it back any time.</p>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {order.map((id, i) => <Row key={id} id={id} first={i === 0} last={i === order.length - 1} hidden={hidden.includes(id)} onMove={move} onToggle={toggle} />)}
              </ul>
            </SortableContext>
          </DndContext>
          {err && <p role="alert" className="text-sm text-neg">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary min-h-11" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
            <button type="button" className="btn min-h-11" disabled={pending} onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn min-h-11" disabled={pending} onClick={reset}>Back to standard</button>
          </div>
        </section>
      )}
    </>
  );
}

function Row({ id, first, last, hidden, onMove, onToggle }: { id: string; first: boolean; last: boolean; hidden: boolean; onMove: (id: string, d: -1 | 1) => void; onToggle: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const btn = "flex size-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800";
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-1 rounded-xl border border-[#E2E8F0] bg-white pr-1 dark:border-slate-700 dark:bg-slate-900">
      <button type="button" aria-label={`Drag ${homeLabel(id)}`} className={`${btn} cursor-grab touch-none`} {...attributes} {...listeners}><GripVertical className="size-5" aria-hidden /></button>
      <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${hidden ? "text-slate-400 line-through" : ""}`}>{homeLabel(id)}</span>
      <button type="button" className={btn} aria-label={`Move ${homeLabel(id)} up`} disabled={first} onClick={() => onMove(id, -1)}><ArrowUp className="size-4" aria-hidden /></button>
      <button type="button" className={btn} aria-label={`Move ${homeLabel(id)} down`} disabled={last} onClick={() => onMove(id, 1)}><ArrowDown className="size-4" aria-hidden /></button>
      <button type="button" className={btn} aria-pressed={!hidden} aria-label={hidden ? `Show ${homeLabel(id)}` : `Hide ${homeLabel(id)}`} onClick={() => onToggle(id)}>
        {hidden ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
      </button>
    </li>
  );
}
