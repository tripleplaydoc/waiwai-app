"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, closestCorners,
  useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, GripVertical, Pencil, Plus } from "lucide-react";
import { AssignedInput } from "./budget-controls";
import { GroupDialog, PocketDialog } from "./pocket-dialog";
import { archiveGroupAction, renameGroupAction, renamePocketAction, reorderAction } from "@/app/actions/pockets";
import { InlineName } from "@/components/inline-name";
import { typeLabel } from "@/lib/budget/expense-types";
import { openMoveMoney } from "./move-money-host";
import { BillBadge, MarkPaidButton } from "./bill-controls";
import { shortDate } from "@/lib/budget/bills";
import { centsToInput, formatCents } from "@/lib/utils/currency";
import type { GroupVM, PocketVM } from "@/lib/budget/board-types";

// Desktop columns: handle | name | assigned | activity | available | edit.
const COLS = "md:grid-cols-[28px_minmax(0,1fr)_128px_104px_116px_40px]";
const STORE = "waiwai:collapsed-groups";

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
  p, workspaceId, month, onEdit, handleProps, overlay,
}: {
  p: PocketVM; workspaceId: string; month: string; onEdit: () => void; overlay?: boolean;
  handleProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const pr = p.progress;
  const sub = [typeLabel(p.expenseType), p.bill && !overlay ? (p.bill.state === "paid" ? "Paid" : p.bill.state === "overdue" ? "Overdue" : `Due ${shortDate(p.bill.dueIso)}`) : null].filter(Boolean).join(" · ");
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 border-t border-[#E2E8F0] bg-white px-3 py-2.5 md:items-center md:gap-x-3 md:py-3 ${COLS} dark:border-slate-800 dark:bg-slate-900 ${overlay ? "rounded-xl border shadow-xl" : ""}`}>
      <button type="button" aria-label={`Drag ${p.name}`} className="hidden size-7 cursor-grab touch-none items-center justify-center rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing md:flex dark:hover:bg-slate-800" {...handleProps}>
        <GripVertical className="size-4" aria-hidden />
      </button>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {overlay ? <span className="text-sm font-semibold">{p.name}</span> : (
            <InlineName
              value={p.name} label="Pocket name" disabled={p.isSystemManaged}
              onSave={(n) => renamePocketAction(workspaceId, p.id, n)}
              className="break-words text-[15px] font-semibold leading-snug md:text-sm md:font-medium"
            />
          )}
          {typeLabel(p.expenseType) && <span className="hidden rounded bg-cyan-50 px-1.5 py-0.5 text-[11px] font-medium text-water md:inline dark:bg-cyan-950/60">{typeLabel(p.expenseType)}</span>}
          {p.priorityRank !== null && <span className="hidden rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-[#1E4FBF] md:inline dark:bg-blue-950 dark:text-blue-300">P{p.priorityRank}</span>}
          {p.isSystemManaged && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">system</span>}
          {p.allocationBps !== null && <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 md:inline dark:bg-slate-800">{p.allocationBps / 100}%</span>}
        </div>
        {sub && <div className={`mt-0.5 truncate text-xs md:hidden ${p.bill?.state === "overdue" ? "font-medium text-neg" : "text-slate-500 dark:text-slate-400"}`}>{sub}</div>}
        {p.bill && !overlay && (
          <div className="mt-1.5 hidden flex-wrap items-center gap-2 md:flex">
            <BillBadge status={p.bill} />
            <MarkPaidButton workspaceId={workspaceId} categoryId={p.id} month={month} status={p.bill} manualPaid={p.manualPaid} />
          </div>
        )}
        <div className="hidden md:block"><ProgressBlock p={p} onSetCost={onEdit} /></div>
      </div>

      <div className="text-right md:order-5">
        {p.isSystemManaged || overlay ? (
          <span className={`nums inline-block min-w-[5.5rem] rounded-full px-3 py-1.5 text-right text-[15px] font-semibold md:min-w-20 md:py-1 md:text-sm ${pill(p)}`}>{formatCents(p.availableCents)}</span>
        ) : (
          <button type="button" onClick={() => openMoveMoney(p.id, "add")} title="Add money to this pocket, or move it" aria-label={`${p.name}: ${formatCents(p.availableCents)} available. Add or move money`}
            className={`nums inline-block min-w-[5.5rem] cursor-pointer rounded-full px-3 py-1.5 text-right text-[15px] font-semibold hover:ring-2 hover:ring-water/40 md:min-w-20 md:py-1 md:text-sm ${pill(p)}`}>{formatCents(p.availableCents)}</button>
        )}
      </div>

      <label className="hidden items-center gap-2 md:order-3 md:block md:text-right">
        <span className="sr-only">Assigned</span>
        {overlay ? <span className="nums text-sm">{centsToInput(p.assignedCents)}</span> : (
          <AssignedInput categoryId={p.id} month={month} initial={centsToInput(p.assignedCents)} label={`Assigned to ${p.name}`} />
        )}
      </label>
      <div className="nums hidden text-right text-sm text-slate-600 md:order-4 md:block dark:text-slate-300">{formatCents(p.activityCents)}</div>
      <button type="button" onClick={onEdit} aria-label={`Edit ${p.name}`} className="flex size-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:order-6 md:size-9 dark:hover:bg-slate-800">
        <Pencil className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function SortablePocket({ p, workspaceId, month, onEdit }: { p: PocketVM; workspaceId: string; month: string; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `p:${p.id}`, data: { type: "pocket" } });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}>
      <PocketRowView p={p} workspaceId={workspaceId} month={month} onEdit={onEdit} handleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function GroupSection({
  g, workspaceId, month, onEditPocket, onAddPocket, onEditGroup, fixed, collapsed, onToggle,
}: {
  g: GroupVM; workspaceId: string; month: string; fixed: boolean; collapsed: boolean; onToggle: () => void;
  onEditPocket: (p: PocketVM) => void; onAddPocket: (groupId: string) => void; onEditGroup: (g: GroupVM) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `g:${g.id}`, data: { type: "group" }, disabled: fixed });
  const drop = useDroppable({ id: `gdrop:${g.id}`, disabled: g.pockets.length > 0 });
  const sum = (f: (p: PocketVM) => number) => g.pockets.reduce((s, p) => s + f(p), 0);
  const needed = sum((p) => p.progress.stillNeededCents);
  const iconBtn = "flex size-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/15 hover:text-white";
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="card overflow-hidden"
      aria-label={g.name}
    >
      <div className={`flex items-center gap-1.5 bg-group px-2 py-1.5 text-white md:grid md:gap-x-3 md:px-3 md:py-2 ${COLS}`}>
        {fixed ? <span className="hidden size-7 md:block" /> : (
          <button type="button" aria-label={`Drag category ${g.name}`} className={`${iconBtn} hidden cursor-grab touch-none active:cursor-grabbing md:flex`} {...attributes} {...listeners}>
            <GripVertical className="size-4" aria-hidden />
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${g.name}`} className={`${iconBtn} shrink-0 md:-ml-1`}>
            <ChevronDown className={`size-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} aria-hidden />
          </button>
          <h2 className="min-w-0 text-[15px] font-bold tracking-tight md:text-sm">
            {fixed ? g.name : (
              <InlineName
                value={g.name} label="Category name"
                onSave={(n) => renameGroupAction(workspaceId, g.id, n)}
                className="break-words font-bold !text-white hover:!bg-white/15"
                inputClassName="!text-slate-900"
              />
            )}
          </h2>
          {g.allocationBps !== null && <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white">{g.allocationBps / 100}%</span>}
          {!fixed && (
            <button type="button" onClick={() => onEditGroup(g)} aria-label={`Edit category ${g.name}`} className={`${iconBtn} !size-7 shrink-0`}>
              <Pencil className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
        <div className="nums hidden text-right text-xs font-semibold text-white/85 md:order-3 md:block">{formatCents(sum((p) => p.assignedCents))}</div>
        <div className="nums hidden text-right text-xs font-semibold text-white/85 md:order-4 md:block">{formatCents(sum((p) => p.activityCents))}</div>
        <div className="nums shrink-0 text-right text-[13px] font-semibold text-white/90 md:order-5 md:text-xs">{formatCents(sum((p) => p.availableCents))}</div>
        <button type="button" onClick={() => onAddPocket(g.id)} aria-label={`Add pocket to ${g.name}`} className={`${iconBtn} shrink-0 md:order-6`}>
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      {!collapsed && needed > 0 && <div className="border-t border-[#E2E8F0] bg-warn-soft/60 px-4 py-1 text-[11px] font-medium text-warn dark:border-slate-800">{formatCents(needed)} still needed to fund this category</div>}
      <div ref={drop.setNodeRef} hidden={collapsed}>
        <SortableContext items={g.pockets.map((p) => `p:${p.id}`)} strategy={verticalListSortingStrategy}>
          {g.pockets.map((p) => <SortablePocket key={p.id} p={p} workspaceId={workspaceId} month={month} onEdit={() => onEditPocket(p)} />)}
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
  workspaceId, isBusiness, month, groups: serverGroups, allGroups, customTypes,
}: { customTypes: string[]; workspaceId: string; isBusiness: boolean; month: string; groups: GroupVM[]; allGroups: { id: string; name: string }[] }) {
  const [groups, setGroups] = useState(serverGroups);
  const ref = useRef(serverGroups);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [, start] = useTransition();
  const [pocketDlg, setPocketDlg] = useState<{ pocket: PocketVM | null; groupId?: string } | null>(null);
  const [groupDlg, setGroupDlg] = useState<{ group: { id: string; name: string } | null } | null>(null);

  useEffect(() => { setGroups(serverGroups); ref.current = serverGroups; }, [serverGroups]);

  // Which categories are folded up (remembered on this device, per workspace).
  const storeKey = `${STORE}:${workspaceId}`;
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(storeKey) ?? "[]"); if (Array.isArray(v)) setCollapsed(v.filter((x) => typeof x === "string")); } catch { /* ignore */ }
  }, [storeKey]);
  const saveCollapsed = (next: string[]) => { setCollapsed(next); try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* ignore */ } };
  const toggleGroup = (id: string) => saveCollapsed(collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id]);

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
        {groups.length > 1 && (() => {
          const allFolded = groups.every((g) => collapsed.includes(g.id));
          return (
            <button type="button" className="btn btn-sm" onClick={() => saveCollapsed(allFolded ? [] : groups.map((g) => g.id))} aria-label={allFolded ? "Expand all categories" : "Collapse all categories"}>
              {allFolded ? <ChevronsUpDown className="size-4" aria-hidden /> : <ChevronsDownUp className="size-4" aria-hidden />} <span className="hidden sm:inline">{allFolded ? "Expand all" : "Collapse all"}</span>
            </button>
          );
        })()}
        <button type="button" className="btn btn-sm" onClick={() => setGroupDlg({ group: null })}><Plus className="size-4" aria-hidden /> Category</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setPocketDlg({ pocket: null })}><Plus className="size-4" aria-hidden /> Pocket <span className="kbd hidden sm:inline-flex !border-white/30 !bg-white/15 !text-white">N</span></button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-neg-soft px-4 py-2 text-sm text-neg">{error}</p>}

      <div className={`hidden px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:grid md:gap-x-3 ${COLS} dark:text-slate-400`}>
        <span /> <span>Category / pocket</span><span className="text-right">Assigned</span><span className="text-right">Activity</span><span className="text-right">Available</span><span />
      </div>

      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); update(() => serverGroups); }}>
        <SortableContext items={sortableGroupIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {groups.map((g) => (
              <GroupSection
                key={g.id} g={g} collapsed={collapsed.includes(g.id)} onToggle={() => toggleGroup(g.id)} workspaceId={workspaceId} month={month} fixed={g.id === "__none"}
                onEditPocket={(p) => setPocketDlg({ pocket: p })}
                onAddPocket={(groupId) => setPocketDlg({ pocket: null, groupId })}
                onEditGroup={(grp) => setGroupDlg({ group: { id: grp.id, name: grp.name } })}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 180 }}>
          {activePocket ? <PocketRowView p={activePocket} workspaceId={workspaceId} month={month} onEdit={() => {}} overlay /> : null}
          {activeGroup ? <div className="card bg-group px-4 py-3 text-sm font-bold text-white shadow-xl">{activeGroup.name}</div> : null}
        </DragOverlay>
      </DndContext>

      {!hasAny && <p className="text-sm text-slate-500">No categories yet. Add one to get started.</p>}
      <p className="text-xs text-slate-500 dark:text-slate-400">Drag the handle <GripVertical className="inline size-3.5 align-text-bottom" aria-hidden /> to reorder, or to move a pocket into another category. Tap the arrow to fold a category. Click any name to rename it. Keyboard: focus a handle, press Space, use the arrow keys, then Space to drop.</p>

      {pocketDlg && (
        <PocketDialog
          customTypes={customTypes}
          open onClose={() => setPocketDlg(null)} workspaceId={workspaceId} isBusiness={isBusiness}
          groups={allGroups} pocket={pocketDlg.pocket} defaultGroupId={pocketDlg.groupId} monthIso={month}
        />
      )}
      {groupDlg && (
        <GroupDialog
          open onClose={() => setGroupDlg(null)} workspaceId={workspaceId} group={groupDlg.group}
          pocketCount={groups.find((x) => x.id === groupDlg.group?.id)?.pockets.length ?? 0}
          releaseCents={(groups.find((x) => x.id === groupDlg.group?.id)?.pockets ?? []).reduce((t, p) => t + Math.max(0, p.availableCents), 0)}
          onDelete={groupDlg.group ? async () => { const r = await archiveGroupAction(workspaceId, groupDlg.group!.id); return r.ok ? null : r.error; } : undefined}
        />
      )}
    </div>
  );
}
