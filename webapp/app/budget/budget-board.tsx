"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, closestCorners,
  useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus } from "lucide-react";
import { AssignedInput } from "./budget-controls";
import { GroupDialog, PocketDialog } from "./pocket-dialog";
import { archiveGroupAction, reorderAction } from "@/app/actions/pockets";
import { centsToInput, formatCents } from "@/lib/utils/currency";
import type { GroupVM, PocketVM } from "@/lib/budget/board-types";

const GRID = "grid items-center gap-x-3 grid-cols-[24px_minmax(0,1fr)_84px_82px] gap-x-2 sm:gap-x-3 sm:grid-cols-[28px_minmax(0,1fr)_112px_92px] md:grid-cols-[28px_minmax(0,1fr)_128px_104px_116px_40px]";

function pill(p: PocketVM): string {
  const pr = p.progress;
  if (p.availableCents < 0) return "bg-neg-soft text-neg";
  if (p.availableCents === 0) return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  if (pr.hasTarget && pr.stillNeededCents > 0) return "bg-warn-soft text-warn";
  return "bg-pos-soft text-pos";
}

function barColor(state: PocketVM["progress"]["state"]): string {
  if (state === "overspent") return "bg-neg";
  if (state === "funded") return "bg-pos";
  if (state === "partial") return "bg-warn";
  return "bg-slate-300 dark:bg-slate-600";
}

function monthYear(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function ProgressBlock({ p, onSetCost }: { p: PocketVM; onSetCost: () => void }) {
  const pr = p.progress;
  if (!pr.hasTarget) {
    return (
      <button type="button" onClick={onSetCost} className="mt-0.5 text-xs text-slate-400 hover:text-[#2E6BE6] dark:hover:text-blue-300">
        {p.availableCents < 0 ? "Overspent — cover it from another pocket" : "Set a monthly cost or goal"}
      </button>
    );
  }
  let line: string;
  if (pr.targetType === "MONTHLY_FUNDING") {
    line = pr.stillNeededCents === 0 ? `Funded ${formatCents(pr.targetCents)} this month` : `${formatCents(p.assignedCents)} of ${formatCents(pr.targetCents)} · need ${formatCents(pr.stillNeededCents)} more`;
  } else if (pr.targetType === "TARGET_BALANCE_BY_DATE") {
    const by = p.targetDate ? ` by ${monthYear(p.targetDate)}` : "";
    line = `${formatCents(Math.max(0, p.availableCents))} of ${formatCents(pr.targetCents)}${by} · ${formatCents(pr.needThisMonthCents)}/mo`;
    if (pr.stillNeededCents > 0) line += ` · need ${formatCents(pr.stillNeededCents)} more now`;
  } else {
    line = `${formatCents(Math.max(0, p.availableCents))} of ${formatCents(pr.targetCents)} goal`;
  }
  return (
    <div className="mt-1.5">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pr.progress * 100)} aria-label={`${p.name} progress`}
      >
        <div className={`h-full rounded-full transition-[width] duration-500 ${barColor(pr.state)}`} style={{ width: `${Math.round(pr.progress * 100)}%` }} />
      </div>
      <div className={`mt-1 text-[11px] leading-tight ${pr.state === "partial" || pr.state === "empty" ? "text-warn" : pr.state === "overspent" ? "text-neg" : "text-slate-500 dark:text-slate-400"}`}>{line}</div>
    </div>
  );
}

function PocketRowView({
  p, month, onEdit, handleProps, overlay,
}: {
  p: PocketVM; month: string; onEdit: () => void; overlay?: boolean;
  handleProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <div className={`${GRID} border-t border-[#E2E8F0] bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900 ${overlay ? "rounded-xl border shadow-xl" : ""}`}>
      <button type="button" aria-label={`Drag ${p.name}`} className="flex size-7 cursor-grab touch-none items-center justify-center rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing dark:hover:bg-slate-800" {...handleProps}>
        <GripVertical className="size-4" aria-hidden />
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="truncate text-sm font-medium">{p.name}</span>
          {p.priorityRank !== null && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-[#1E4FBF] dark:bg-blue-950 dark:text-blue-300">P{p.priorityRank}</span>}
          {p.isSystemManaged && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">system</span>}
          {p.allocationBps !== null && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">{p.allocationBps / 100}%</span>}
        </div>
        <ProgressBlock p={p} onSetCost={onEdit} />
      </div>
      <div className="text-right">
        {overlay ? <span className="nums text-sm">{centsToInput(p.assignedCents)}</span> : (
          <AssignedInput categoryId={p.id} month={month} initial={centsToInput(p.assignedCents)} label={`Assigned to ${p.name}`} />
        )}
      </div>
      <div className="nums hidden text-right text-sm text-slate-600 md:block dark:text-slate-300">{formatCents(p.activityCents)}</div>
      <div className="text-right">
        <span className={`nums inline-block min-w-[4.5rem] rounded-full px-2 py-1 text-right text-xs font-semibold sm:min-w-20 sm:px-3 sm:text-sm ${pill(p)}`}>{formatCents(p.availableCents)}</span>
      </div>
      <button type="button" onClick={onEdit} aria-label={`Edit ${p.name}`} className="hidden size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:flex dark:hover:bg-slate-800">
        <Pencil className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function SortablePocket({ p, month, onEdit }: { p: PocketVM; month: string; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `p:${p.id}`, data: { type: "pocket" } });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}>
      <PocketRowView p={p} month={month} onEdit={onEdit} handleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function GroupSection({
  g, month, onEditPocket, onAddPocket, onEditGroup, fixed,
}: {
  g: GroupVM; month: string; fixed: boolean;
  onEditPocket: (p: PocketVM) => void; onAddPocket: (groupId: string) => void; onEditGroup: (g: GroupVM) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `g:${g.id}`, data: { type: "group" }, disabled: fixed });
  const drop = useDroppable({ id: `gdrop:${g.id}`, disabled: g.pockets.length > 0 });
  const sum = (f: (p: PocketVM) => number) => g.pockets.reduce((s, p) => s + f(p), 0);
  const needed = sum((p) => p.progress.stillNeededCents);
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="card overflow-hidden"
      aria-label={g.name}
    >
      <div className={`${GRID} bg-navy-soft px-3 py-2.5 dark:bg-slate-800/60`}>
        {fixed ? <span /> : (
          <button type="button" aria-label={`Drag category ${g.name}`} className="flex size-7 cursor-grab touch-none items-center justify-center rounded-md text-slate-400 hover:bg-white/70 active:cursor-grabbing dark:hover:bg-slate-700" {...attributes} {...listeners}>
            <GripVertical className="size-4" aria-hidden />
          </button>
        )}
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-bold tracking-tight">{g.name}</h2>
          {g.allocationBps !== null && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1E4FBF] ring-1 ring-blue-200 dark:bg-slate-900 dark:text-blue-300 dark:ring-blue-900">{g.allocationBps / 100}%</span>}
          {!fixed && (
            <button type="button" onClick={() => onEditGroup(g)} aria-label={`Edit category ${g.name}`} className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-white/70 hover:text-slate-700 dark:hover:bg-slate-700">
              <Pencil className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
        <div className="nums text-right text-xs font-semibold text-slate-600 dark:text-slate-300">{formatCents(sum((p) => p.assignedCents))}</div>
        <div className="nums hidden text-right text-xs font-semibold text-slate-600 md:block dark:text-slate-300">{formatCents(sum((p) => p.activityCents))}</div>
        <div className="nums text-right text-xs font-semibold text-slate-600 dark:text-slate-300">{formatCents(sum((p) => p.availableCents))}</div>
        <button type="button" onClick={() => onAddPocket(g.id)} aria-label={`Add pocket to ${g.name}`} className="hidden size-9 items-center justify-center rounded-lg text-[#2E6BE6] hover:bg-white/70 md:flex dark:text-blue-300 dark:hover:bg-slate-700">
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      {needed > 0 && <div className="border-t border-[#E2E8F0] bg-warn-soft/60 px-4 py-1 text-[11px] font-medium text-warn dark:border-slate-800">{formatCents(needed)} still needed to fund this category</div>}
      <div ref={drop.setNodeRef}>
        <SortableContext items={g.pockets.map((p) => `p:${p.id}`)} strategy={verticalListSortingStrategy}>
          {g.pockets.map((p) => <SortablePocket key={p.id} p={p} month={month} onEdit={() => onEditPocket(p)} />)}
        </SortableContext>
        {g.pockets.length === 0 && (
          <button type="button" onClick={() => onAddPocket(g.id)} className={`flex min-h-14 w-full items-center justify-center gap-2 border-t border-dashed border-[#CBD5E1] text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50 ${drop.isOver ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
            <Plus className="size-4" aria-hidden /> Add a pocket, or drag one here
          </button>
        )}
      </div>
    </section>
  );
}

const collision: CollisionDetection = (args) => {
  const type = args.active.data.current?.type;
  if (type === "group") {
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith("g:")) });
  }
  return closestCorners({ ...args, droppableContainers: args.droppableContainers.filter((c) => /^(p:|gdrop:)/.test(String(c.id))) });
};

export function BudgetBoard({
  workspaceId, isBusiness, month, groups: serverGroups, allGroups,
}: { workspaceId: string; isBusiness: boolean; month: string; groups: GroupVM[]; allGroups: { id: string; name: string }[] }) {
  const [groups, setGroups] = useState(serverGroups);
  const ref = useRef(serverGroups);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [, start] = useTransition();
  const [pocketDlg, setPocketDlg] = useState<{ pocket: PocketVM | null; groupId?: string } | null>(null);
  const [groupDlg, setGroupDlg] = useState<{ group: { id: string; name: string } | null } | null>(null);

  useEffect(() => { setGroups(serverGroups); ref.current = serverGroups; }, [serverGroups]);

  const update = useCallback((fn: (prev: GroupVM[]) => GroupVM[]) => {
    setGroups((prev) => { const next = fn(prev); ref.current = next; return next; });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // "N" opens the add-pocket dialog (keyboard-first), unless you're typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector("[role=dialog]")) return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); setPocketDlg({ pocket: null }); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function persist(next: GroupVM[]) {
    const payload = {
      groups: next.filter((g) => g.id !== "__none").map((g) => g.id),
      pockets: Object.fromEntries(next.map((g) => [g.id, g.pockets.map((p) => p.id)])),
    };
    setError(undefined);
    start(async () => {
      const r = await reorderAction(workspaceId, JSON.stringify(payload));
      if (!r.ok) { setError(r.error); setGroups(serverGroups); ref.current = serverGroups; }
    });
  }

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over || active.data.current?.type !== "pocket") return;
    const activeKey = String(active.id).slice(2);
    const overId = String(over.id);
    update((prev) => {
      const from = prev.find((g) => g.pockets.some((p) => p.id === activeKey));
      if (!from) return prev;
      let to: GroupVM | undefined;
      let index = 0;
      if (overId.startsWith("p:")) {
        const oid = overId.slice(2);
        to = prev.find((g) => g.pockets.some((p) => p.id === oid));
        if (!to) return prev;
        index = to.pockets.findIndex((p) => p.id === oid);
        const translated = active.rect.current.translated;
        if (translated && translated.top > over.rect.top + over.rect.height / 2) index += 1;
      } else if (overId.startsWith("gdrop:")) {
        to = prev.find((g) => g.id === overId.slice(6));
        index = to?.pockets.length ?? 0;
      } else return prev;
      if (!to || to.id === from.id) return prev;
      const moving = from.pockets.find((p) => p.id === activeKey)!;
      const target = to;
      return prev.map((g) =>
        g.id === from.id ? { ...g, pockets: g.pockets.filter((p) => p.id !== activeKey) }
        : g.id === target.id ? { ...g, pockets: [...g.pockets.slice(0, index), moving, ...g.pockets.slice(index)] }
        : g
      );
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) { update(() => serverGroups); return; }
    const type = active.data.current?.type;
    let next = ref.current;
    if (type === "group") {
      const from = next.findIndex((g) => `g:${g.id}` === String(active.id));
      const to = next.findIndex((g) => `g:${g.id}` === String(over.id));
      if (from < 0 || to < 0) return;
      if (from !== to) { next = arrayMove(next, from, to); update(() => next); }
    } else {
      const activeKey = String(active.id).slice(2);
      const overKey = String(over.id).startsWith("p:") ? String(over.id).slice(2) : null;
      const gi = next.findIndex((g) => g.pockets.some((p) => p.id === activeKey));
      if (gi >= 0 && overKey) {
        const list = next[gi].pockets;
        const a = list.findIndex((p) => p.id === activeKey);
        const o = list.findIndex((p) => p.id === overKey);
        if (o >= 0 && a !== o) { next = next.map((g, i) => (i === gi ? { ...g, pockets: arrayMove(g.pockets, a, o) } : g)); update(() => next); }
      }
    }
    persist(next);
  }

  const activePocket = activeId?.startsWith("p:") ? groups.flatMap((g) => g.pockets).find((p) => p.id === activeId.slice(2)) : undefined;
  const activeGroup = activeId?.startsWith("g:") ? groups.find((g) => g.id === activeId.slice(2)) : undefined;
  const sortableGroupIds = groups.filter((g) => g.id !== "__none").map((g) => `g:${g.id}`);
  const hasAny = groups.some((g) => g.id !== "__none") || groups.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-bold tracking-tight">Your pockets</h2>
        <button type="button" className="btn btn-sm" onClick={() => setGroupDlg({ group: null })}><Plus className="size-4" aria-hidden /> Category</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setPocketDlg({ pocket: null })}><Plus className="size-4" aria-hidden /> Pocket <span className="kbd !border-white/30 !bg-white/15 !text-white">N</span></button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-neg-soft px-4 py-2 text-sm text-neg">{error}</p>}

      <div className={`${GRID} px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400`}>
        <span /> <span>Category / pocket</span><span className="text-right">Assigned</span><span className="hidden text-right md:block">Activity</span><span className="text-right">Available</span><span className="hidden md:block" />
      </div>

      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); update(() => serverGroups); }}>
        <SortableContext items={sortableGroupIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {groups.map((g) => (
              <GroupSection
                key={g.id} g={g} month={month} fixed={g.id === "__none"}
                onEditPocket={(p) => setPocketDlg({ pocket: p })}
                onAddPocket={(groupId) => setPocketDlg({ pocket: null, groupId })}
                onEditGroup={(grp) => setGroupDlg({ group: { id: grp.id, name: grp.name } })}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 180 }}>
          {activePocket ? <PocketRowView p={activePocket} month={month} onEdit={() => {}} overlay /> : null}
          {activeGroup ? <div className="card bg-navy-soft px-4 py-3 text-sm font-bold shadow-xl">{activeGroup.name}</div> : null}
        </DragOverlay>
      </DndContext>

      {!hasAny && <p className="text-sm text-slate-500">No categories yet. Add one to get started.</p>}
      <p className="text-xs text-slate-500 dark:text-slate-400">Drag the handle <GripVertical className="inline size-3.5 align-text-bottom" aria-hidden /> to reorder, or to move a pocket into another category. Keyboard: focus a handle, press Space, use the arrow keys, then Space to drop.</p>

      {pocketDlg && (
        <PocketDialog
          open onClose={() => setPocketDlg(null)} workspaceId={workspaceId} isBusiness={isBusiness}
          groups={allGroups} pocket={pocketDlg.pocket} defaultGroupId={pocketDlg.groupId} monthIso={month}
        />
      )}
      {groupDlg && (
        <GroupDialog
          open onClose={() => setGroupDlg(null)} workspaceId={workspaceId} group={groupDlg.group}
          onDelete={groupDlg.group ? async () => { const r = await archiveGroupAction(workspaceId, groupDlg.group!.id); return r.ok ? null : r.error; } : undefined}
        />
      )}
    </div>
  );
}
