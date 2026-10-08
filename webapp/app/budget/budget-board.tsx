"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, closestCorners,
  useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChevronDown, GripVertical, Pencil, Plus, Sprout } from "lucide-react";
import { AssignedInput } from "./budget-controls";
import { GroupDialog, PocketDialog } from "./pocket-dialog";
import { useFunding } from "./funding-view";
import { archiveGroupAction, renameGroupAction, renamePocketAction, reorderAction } from "@/app/actions/pockets";
import { InlineName } from "@/components/inline-name";
import { typeLabel } from "@/lib/budget/expense-types";
import { openMoveMoney } from "./move-money-host";
import { BillBadge, MarkPaidButton } from "./bill-controls";
import { shortDate } from "@/lib/budget/bills";
import { centsToInput, formatCents } from "@/lib/utils/currency";
import type { AssetOption, GroupVM, PocketVM } from "@/lib/budget/board-types";
import type { Horizon } from "@/lib/budget/horizon";
import { assetProgress } from "@/lib/budget/asset-progress";
import type { TagVM } from "@/lib/budget/tags";
import { TagChip, TagManager } from "./tag-manager";
import { AddMenu } from "./add-menu";
import { Hint } from "@/components/hint";
import "./celebrate.css";

// Desktop columns: handle | name | assigned | activity | available | edit.
const COLS_FULL = "md:grid-cols-[36px_minmax(0,1fr)_128px_104px_120px_44px]";
const COLS_SIMPLE = "md:grid-cols-[36px_minmax(0,1fr)_120px_44px]";
/** Keeps a small control looking small while giving fingers a 44px target (an invisible extension of its box). */
const TAP = "relative before:absolute before:-inset-y-3 before:inset-x-0";
/** Simple hides the Assigned and Activity columns and the extra tags; horizon decides whether needs count next month too. */
const ViewCtx = createContext<{ simple: boolean; horizon: Horizon; tags: TagVM[]; tagFilter: string | null }>({ simple: false, horizon: "now", tags: [], tagFilter: null });
const useView = () => useContext(ViewCtx);
const STORE = "waiwai:collapsed-groups";

function pill(p: PocketVM, horizon: Horizon = "now"): string {
  const pr = p.progress;
  if (p.availableCents < 0) return "bg-neg-soft text-neg";
  if (p.availableCents === 0) return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  const need = horizon === "ahead" ? p.aheadNeedCents : pr.stillThisMonthCents;
  if (pr.hasTarget && need > 0) return "bg-warn-soft text-warn";
  return "bg-pos-soft text-pos";
}

function barColor(state: PocketVM["progress"]["state"], soft = false): string {
  if (state === "overspent") return "bg-neg";
  if (state === "funded") return "bg-pos";
  if (state === "partial") return "bg-warn";
  return "bg-slate-300 dark:bg-slate-600";
}

/** A pocket with a target that needs nothing more for the chosen horizon (and isn't overspent) counts as funded. */
function isFunded(p: PocketVM, horizon: Horizon): boolean {
  if (!p.progress.hasTarget || p.availableCents < 0) return false;
  return (horizon === "ahead" ? p.aheadNeedCents : p.progress.stillThisMonthCents) === 0;
}

/**
 * True for a moment when the pocket flips from "needs funding" to "funded" while you are looking at it (after you assign money),
 * never on first load and never because you switched month or horizon.
 */
function useJustFunded(funded: boolean, scope: string): boolean {
  const prev = useRef<{ scope: string; funded: boolean } | null>(null);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const before = prev.current;
    prev.current = { scope, funded };
    if (before && before.scope === scope && !before.funded && funded) {
      setFresh(true);
      const t = setTimeout(() => setFresh(false), 1800);
      return () => clearTimeout(t);
    }
    setFresh(false);
  }, [funded, scope]);
  return fresh;
}

const SPECKS = [
  { dx: "-22px", dy: "-18px", c: "#10B981", d: "0ms" }, { dx: "0px", dy: "-26px", c: "#4F46E5", d: "40ms" }, { dx: "22px", dy: "-18px", c: "#D97706", d: "20ms" },
  { dx: "-28px", dy: "2px", c: "#4F46E5", d: "60ms" }, { dx: "28px", dy: "2px", c: "#10B981", d: "30ms" }, { dx: "-14px", dy: "16px", c: "#D97706", d: "50ms" }, { dx: "14px", dy: "16px", c: "#10B981", d: "10ms" },
];

/** The little "✓ Funded" badge. When it has just earned it, it pops and a few specks drift out (CSS only; off for reduced motion). */
function FundedBadge({ fresh }: { fresh: boolean }) {
  return (
    <span className="relative inline-flex" data-testid="funded-badge">
      <span className={`inline-flex items-center gap-0.5 rounded-full bg-pos-soft px-1.5 py-0.5 text-[11px] font-semibold leading-none text-pos ${fresh ? "ww-check-new" : ""}`}>
        <Check className="size-3" strokeWidth={3} aria-hidden /> Funded
      </span>
      {fresh && (
        <span className="ww-confetti" aria-hidden>
          {SPECKS.map((k, i) => <i key={i} style={{ "--dx": k.dx, "--dy": k.dy, "--delay": k.d, background: k.c } as React.CSSProperties} />)}
        </span>
      )}
    </span>
  );
}

function monthYear(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function ProgressBlock({ p, onSetCost, compact }: { p: PocketVM; onSetCost: () => void; compact?: boolean }) {
  const pr = p.progress;
  const { horizon } = useView();
  if (!pr.hasTarget) {
    if (compact) return null;
    return (
      <button type="button" onClick={onSetCost} className={`${TAP} mt-0.5 text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300`}>
        {p.availableCents < 0 ? "Overspent — cover it from another pocket" : p.asset ? "Set how much to add each month" : "Set a monthly cost or goal"}
      </button>
    );
  }
  const aheadMode = horizon === "ahead" && pr.targetType === "MONTHLY_FUNDING";
  const total = Math.max(p.aheadNeedCents, Math.max(0, pr.targetCents - Math.max(0, -p.activityCents)) + pr.targetCents);
  const need = horizon === "ahead" ? p.aheadNeedCents : pr.stillThisMonthCents;
  const covered = need === 0 && pr.state !== "overspent";
  // Covered for the chosen horizon = a full green bar, whichever view you are in.
  const barFill = covered ? 1 : aheadMode ? Math.min(1, Math.max(0, 1 - p.aheadNeedCents / total)) : pr.progress;
  const barTone = covered ? "funded" : pr.state === "funded" ? "partial" : pr.state;
  let line: string;
  if (horizon === "ahead" && pr.targetType === "MONTHLY_FUNDING") {
    line = p.aheadNeedCents === 0 ? `Covered through next month (${formatCents(pr.targetCents)}/mo)` : `Need ${formatCents(p.aheadNeedCents)} more to cover next month too`;
  } else if (pr.targetType === "MONTHLY_FUNDING") {
    line = pr.stillThisMonthCents === 0 ? `Funded ${formatCents(pr.targetCents)} this month` : `${formatCents(p.assignedCents)} of ${formatCents(pr.targetCents)} · need ${formatCents(pr.stillThisMonthCents)} more`;
  } else if (pr.targetType === "TARGET_BALANCE_BY_DATE") {
    const by = p.targetDate ? ` by ${monthYear(p.targetDate)}` : "";
    line = `${formatCents(Math.max(0, p.availableCents))} of ${formatCents(pr.targetCents)}${by} · ${formatCents(pr.needThisMonthCents)}/mo`;
    if (pr.stillNeededCents > 0) line += ` · need ${formatCents(pr.stillNeededCents)} more now`;
  } else {
    line = `${formatCents(Math.max(0, p.availableCents))} of ${formatCents(pr.targetCents)} goal`;
  }
  return (
    <div className="mt-2">
      <div
        className={`${compact ? "h-1.5" : "h-2"} w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800`}
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(barFill * 100)} aria-label={`${p.name} progress`}
      >
        <div className={`bar-grow h-full rounded-full transition-[width] duration-500 ${barColor(barTone, horizon === "ahead")}`} style={{ width: `${Math.round(barFill * 100)}%` }} />
      </div>
      {!compact && <div className={`nums mt-1.5 text-[11px] leading-tight ${barTone === "partial" || barTone === "empty" ? "text-warn" : barTone === "overspent" ? "text-neg" : "text-slate-500 dark:text-slate-400"}`}>{line}</div>}
    </div>
  );
}

/**
 * For a pocket that feeds an asset: the asset's own current value against the goal for it. The pocket's pill and bar above
 * show the money set aside to put into the asset; this bar shows what the asset is worth now, so it has its own colour.
 */
function AssetBlock({ p, onSetGoal }: { p: PocketVM; onSetGoal: () => void }) {
  const a = p.asset;
  if (!a) return null;
  const pr = assetProgress(a.valueCents, a.goalCents);
  const pct = Math.round(pr.fraction * 100);
  const asOf = a.asOfIso ? ` · as of ${shortDate(a.asOfIso)}` : "";
  return (
    <div className="mt-2.5 min-w-0 rounded-xl bg-slate-50/80 px-3 py-2.5 dark:bg-slate-800/40" data-testid="asset-progress">
      <div className="flex min-w-0 flex-col gap-0.5 text-[11px] leading-tight sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
        <span className="min-w-0 truncate font-medium text-slate-600 dark:text-slate-300">{a.name} is worth</span>
        <span className="nums font-semibold text-slate-800 sm:shrink-0 dark:text-slate-100">{formatCents(a.valueCents)}{pr.hasGoal && <span className="font-normal text-slate-500 dark:text-slate-400"> of {formatCents(a.goalCents!)}</span>}</span>
      </div>
      {pr.hasGoal ? (
        <div
          className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
          role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${a.name} value toward its goal`}
        >
          <div className={`bar-grow h-full rounded-full transition-[width] duration-500 ${pr.reached ? "bg-pos" : "bg-water"}`} style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <button type="button" onClick={onSetGoal} className={`${TAP} mt-1 text-[11px] text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300`}>Set a goal for {a.name}</button>
      )}
      <div className={`mt-1 text-[11px] leading-tight ${pr.reached ? "font-medium text-pos" : "text-slate-500 dark:text-slate-400"}`}>
        {pr.hasGoal ? (pr.reached ? "Goal reached" : `${formatCents(pr.remainingCents)} to go`) : "No goal yet"}{asOf}
      </div>
    </div>
  );
}

/** What this pocket still needs for the chosen horizon, or a quiet "covered". Shown above the available amount. */
function NeedChip({ p, horizon }: { p: PocketVM; horizon: Horizon }) {
  const need = horizon === "ahead" ? p.aheadNeedCents : p.progress.stillThisMonthCents;
  const when = horizon === "ahead" ? "by next month" : "this month";
  if (p.availableCents < 0 && need === 0) return null;
  return need > 0
    ? <div className="nums mb-1 text-[11px] font-semibold text-warn">needs {formatCents(need)} {when}</div>
    : <div className="mb-1 text-[11px] font-medium text-pos">covered {when}</div>;
}

const SOURCE_COLORS = ["#2E6BE6", "#059669", "#D97706", "#7C3AED", "#0891B2", "#DB2777", "#64748B"];

/** Which account the money in a pocket sits in: a thin split bar with a chip per account (account tags follow every Add/Move). */
function SourceStrip({ pocketId, simple }: { pocketId: string; simple: boolean }) {
  const { cash } = useFunding();
  if (cash.accounts.length < 2) return null;
  const rows = Object.entries(cash.byPocket[pocketId] ?? {})
    .filter(([, c]) => c > 0)
    .map(([k, cents]) => ({ k, cents, name: k === "none" ? "Not tagged" : cash.accounts.find((a) => a.id === k)?.name ?? "Other account", color: SOURCE_COLORS[Math.max(0, cash.accounts.findIndex((a) => a.id === k)) % SOURCE_COLORS.length] }))
    .sort((a, b) => b.cents - a.cents);
  if (rows.length === 0) return null;
  const total = rows.reduce((t, r) => t + r.cents, 0);
  return (
    <div className="mt-1.5" data-testid="source-strip">
      {!simple && rows.length > 0 && (
        <div className="mb-1.5 flex h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={`Held in ${rows.map((r) => `${r.name} ${formatCents(r.cents)}`).join(", ")}`}>
          {rows.map((r) => <span key={r.k} style={{ width: `${(r.cents / total) * 100}%`, background: r.color }} />)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-500">Held in <Hint label="What does Held in mean?">Held in shows which bank account the money in this pocket is actually sitting in. It is just a label for where the cash lives; it doesn&apos;t change how much the pocket has.</Hint></span>
        {rows.map((r) => (
          <span key={r.k} className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />{r.name} <span className="nums font-semibold">{formatCents(r.cents)}</span></span>
        ))}
      </div>
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
  const { simple, horizon, tags } = useView();
  const funded = isFunded(p, horizon);
  const fresh = useJustFunded(funded && !overlay, `${month}|${horizon}`);
  const COLS = simple ? COLS_SIMPLE : COLS_FULL;
  const myTags = p.tagIds.map((id) => tags.find((t) => t.id === id)).filter((t): t is TagVM => !!t);
  const { cash } = useFunding();
  const paidFrom = cash.accounts.length > 1 && p.paidFromId ? cash.accounts.find((a) => a.id === p.paidFromId)?.name ?? null : null;
  const sub = [typeLabel(p.expenseType), p.bill && !overlay ? (p.bill.state === "paid" ? "Paid" : p.bill.state === "overdue" ? "Waiting for you" : `Due ${shortDate(p.bill.dueIso)}`) : null, p.targetType === "MONTHLY_FUNDING" && p.monthsAhead > 0 ? `${p.monthsAhead} mo ahead` : null, paidFrom ? `from ${paidFrom}` : null].filter(Boolean).join(" · ");
  return (
    <div style={myTags[0] ? { boxShadow: `inset 4px 0 0 ${myTags[0].color}` } : undefined} className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 border-t border-slate-100 bg-white px-3 py-3.5 md:items-center md:gap-x-3 md:py-4 ${COLS} dark:border-slate-800/70 dark:bg-slate-900 ${fresh ? "ww-row-new" : ""} ${overlay ? "rounded-xl border border-[#E2E8F0] shadow-xl" : ""}`}>
      <button type="button" aria-label={`Drag ${p.name}`} className="hidden size-9 cursor-grab touch-none items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing md:flex dark:hover:bg-slate-800" {...handleProps}>
        <GripVertical className="size-4" aria-hidden />
      </button>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {overlay ? <span className="text-sm font-semibold">{p.name}</span> : (
            <InlineName
              value={p.name} label="Pocket name" disabled={p.isSystemManaged}
              onSave={(n) => renamePocketAction(workspaceId, p.id, n)}
              className="-my-3 break-words py-3 text-[15px] font-semibold leading-snug md:-my-2 md:py-2 md:text-sm md:font-medium"
            />
          )}
          {!simple && typeLabel(p.expenseType) && <span className="hidden rounded bg-cyan-50 px-1.5 py-0.5 text-[11px] font-medium text-water md:inline dark:bg-cyan-950/60">{typeLabel(p.expenseType)}</span>}
          {!simple && p.priorityRank !== null && <span className="hidden rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-[#1E4FBF] md:inline dark:bg-blue-950 dark:text-blue-300">P{p.priorityRank}</span>}
          {funded && !overlay && <FundedBadge fresh={fresh} />}
          {p.legacy && <span title="Saved for the next generation" className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"><Sprout className="size-3" aria-hidden />Generations</span>}
          {p.isSystemManaged && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">system</span>}
          {!simple && p.allocationBps !== null && <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 md:inline dark:bg-slate-800">{p.allocationBps / 100}%</span>}
        </div>
        {myTags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{myTags.map((t) => <TagChip key={t.id} tag={t} small />)}</div>}
        {sub && <div className={`mt-0.5 truncate text-xs ${simple ? "" : "md:hidden"} ${p.bill?.state === "overdue" ? "font-medium text-indigo-700 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"}`}>{sub}</div>}
        {!simple && p.bill && !overlay && (
          <div className="mt-1.5 hidden flex-wrap items-center gap-2 md:flex">
            <BillBadge status={p.bill} />
            <MarkPaidButton workspaceId={workspaceId} categoryId={p.id} month={month} status={p.bill} manualPaid={p.manualPaid} />
          </div>
        )}
        {!overlay && <SourceStrip pocketId={p.id} simple={simple} />}
        <div className="hidden md:block"><ProgressBlock p={p} onSetCost={onEdit} /></div>
        <div className="md:hidden"><ProgressBlock p={p} onSetCost={onEdit} compact /></div>
        {!overlay && <AssetBlock p={p} onSetGoal={onEdit} />}
      </div>

      <div className="text-right md:order-5">
        {!overlay && p.progress.hasTarget && <NeedChip p={p} horizon={horizon} />}
        {overlay ? (
          <span className={`nums inline-block min-w-[5.5rem] rounded-full px-3 py-1.5 text-right text-[15px] font-semibold md:min-w-20 md:py-1 md:text-sm ${pill(p, horizon)}`}>{formatCents(p.availableCents)}</span>
        ) : (
          <button type="button" onClick={() => openMoveMoney(p.id, "add")} title={p.isSystemManaged ? "Add money to this pocket" : "Add money to this pocket, or move it"} aria-label={`${p.name}: ${formatCents(p.availableCents)} available. Add or move money`}
            className={`nums relative inline-block min-w-[5.5rem] cursor-pointer rounded-full px-3 py-1.5 text-right text-[15px] font-semibold before:absolute before:-inset-y-2 before:inset-x-0 hover:ring-2 hover:ring-indigo-400/40 md:min-w-20 md:py-1 md:text-sm ${pill(p, horizon)}`}>{formatCents(p.availableCents)}</button>
        )}
      </div>

      <label className={`hidden items-center gap-2 md:order-3 ${simple ? "" : "md:block"} md:text-right`}>
        <span className="sr-only">Assigned</span>
        {overlay ? <span className="nums text-sm">{centsToInput(p.assignedCents)}</span> : (
          <AssignedInput categoryId={p.id} month={month} initial={centsToInput(p.assignedCents)} label={`Assigned to ${p.name}`} />
        )}
      </label>
      <div className={`nums hidden text-right text-sm text-slate-600 md:order-4 ${simple ? "" : "md:block"} dark:text-slate-300`}>{formatCents(p.activityCents)}</div>
      <button type="button" onClick={onEdit} aria-label={`Edit ${p.name}`} className="flex size-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:order-6 md:size-10 dark:hover:bg-slate-800">
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
  const { simple, horizon, tagFilter } = useView();
  const COLS = simple ? COLS_SIMPLE : COLS_FULL;
  const shown = tagFilter ? g.pockets.filter((p) => p.tagIds.includes(tagFilter)) : g.pockets;
  const sum = (f: (p: PocketVM) => number) => g.pockets.reduce((s, p) => s + f(p), 0);
  const needed = sum((p) => (horizon === "ahead" ? p.aheadNeedCents : p.progress.stillThisMonthCents));
  const iconBtn = "flex size-11 items-center justify-center rounded-xl text-white/75 hover:bg-white/15 hover:text-white md:size-9";
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="card overflow-hidden"
      aria-label={g.name}
    >
      <div className={`flex items-center gap-1 bg-group px-2 py-0.5 text-white md:grid md:gap-x-3 md:px-3 md:py-1.5 ${COLS}`}>
        {fixed ? <span className="hidden size-9 md:block" /> : (
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
                className="-my-3 break-words py-3 font-bold !text-white hover:!bg-white/15"
                inputClassName="!text-slate-900"
              />
            )}
          </h2>
          {g.allocationBps !== null && <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white">{g.allocationBps / 100}%</span>}
          {!fixed && (
            <button type="button" onClick={() => onEditGroup(g)} aria-label={`Edit category ${g.name}`} className={`${iconBtn} shrink-0`}>
              <Pencil className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
        <div className={`nums hidden text-right text-xs font-semibold text-white/85 md:order-3 ${simple ? "" : "md:block"}`}>{formatCents(sum((p) => p.assignedCents))}</div>
        <div className={`nums hidden text-right text-xs font-semibold text-white/85 md:order-4 ${simple ? "" : "md:block"}`}>{formatCents(sum((p) => p.activityCents))}</div>
        <div className="nums shrink-0 text-right text-[13px] font-semibold text-white/90 md:order-5 md:text-xs">{formatCents(sum((p) => p.availableCents))}</div>
        <button type="button" onClick={() => onAddPocket(g.id)} aria-label={`Add pocket to ${g.name}`} className={`${iconBtn} shrink-0 md:order-6`}>
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      {!collapsed && needed > 0 && <div className="bg-warn-soft/60 px-4 py-1.5 text-[11px] font-medium text-warn dark:border-slate-800">{formatCents(needed)} still needed to fund this category{horizon === "ahead" ? " through next month" : " this month"}</div>}
      {!collapsed && needed === 0 && g.pockets.some((p) => p.progress.hasTarget) && <div className="bg-pos-soft/60 px-4 py-1.5 text-[11px] font-medium text-pos dark:border-slate-800">Funded {horizon === "ahead" ? "through next month" : "for this month"}</div>}
      <div ref={drop.setNodeRef} hidden={collapsed}>
        <SortableContext items={shown.map((p) => `p:${p.id}`)} strategy={verticalListSortingStrategy}>
          {shown.map((p) => <SortablePocket key={p.id} p={p} workspaceId={workspaceId} month={month} onEdit={() => onEditPocket(p)} />)}
        </SortableContext>
        {g.pockets.length === 0 && (
          <button type="button" onClick={() => onAddPocket(g.id)} className={`flex min-h-14 w-full items-center justify-center gap-2 border-t border-dashed border-slate-200 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50 ${drop.isOver ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
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
  workspaceId, isBusiness, month, groups: serverGroups, allGroups, customTypes, simple, horizon, tags, assetOptions = [], isPrivate = false,
}: { isPrivate?: boolean; assetOptions?: AssetOption[]; tags: TagVM[]; simple: boolean; horizon: Horizon; customTypes: string[]; workspaceId: string; isBusiness: boolean; month: string; groups: GroupVM[]; allGroups: { id: string; name: string }[] }) {
  const [groups, setGroups] = useState(serverGroups);
  const ref = useRef(serverGroups);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [, start] = useTransition();
  const [pocketDlg, setPocketDlg] = useState<{ pocket: PocketVM | null; groupId?: string } | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tagDlg, setTagDlg] = useState(false);
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

  const COLS = simple ? COLS_SIMPLE : COLS_FULL;
  return (
    <ViewCtx.Provider value={{ simple, horizon, tags, tagFilter }}>
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold tracking-tight">Your pockets</h2>
        <AddMenu
          onPocket={() => setPocketDlg({ pocket: null })}
          onCategory={() => setGroupDlg({ group: null })}
          onTags={() => setTagDlg(true)}
          fold={groups.length > 1 ? (() => { const allFolded = groups.every((g) => collapsed.includes(g.id)); return { allFolded, onToggle: () => saveCollapsed(allFolded ? [] : groups.map((g) => g.id)) }; })() : undefined}
        />
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tag">
          <span className="text-xs text-slate-500">Tags:</span>
          {tags.map((t) => (
            <button key={t.id} type="button" aria-pressed={tagFilter === t.id} onClick={() => setTagFilter(tagFilter === t.id ? null : t.id)}
              className={`inline-flex min-h-11 items-center rounded-full ${tagFilter === t.id ? "ring-2 ring-slate-500" : ""}`}><TagChip tag={t} /></button>
          ))}
          {tagFilter && <button type="button" className="min-h-11 px-2 text-xs font-semibold text-blue-700 dark:text-blue-300" onClick={() => setTagFilter(null)}>Show all</button>}
        </div>
      )}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-neg-soft px-4 py-2 text-sm text-neg">{error}</p>}

      <div className={`hidden px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:grid md:gap-x-3 ${COLS} dark:text-slate-400`}>
        <span /> <span>Category / pocket</span>{!simple && <><span className="text-right">Assigned</span><span className="text-right">Activity</span></>}<span className="text-right">Available</span><span />
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
      <p className="text-xs text-slate-500 dark:text-slate-400">Drag the handle <GripVertical className="inline size-3.5 align-text-bottom" aria-hidden /> to reorder, or to move a pocket into another category. Tap the arrow to fold a category, or use Add for more. Click any name to rename it. Keyboard: focus a handle, press Space, use the arrow keys, then Space to drop.</p>

      {pocketDlg && (
        <PocketDialog
          assetOptions={assetOptions}
          tags={tags}
          customTypes={customTypes}
          open onClose={() => setPocketDlg(null)} workspaceId={workspaceId} isBusiness={isBusiness} isPrivate={isPrivate}
          groups={allGroups} pocket={pocketDlg.pocket} defaultGroupId={pocketDlg.groupId} monthIso={month}
        />
      )}
      <TagManager open={tagDlg} onClose={() => setTagDlg(false)} workspaceId={workspaceId} tags={tags} />
      {groupDlg && (
        <GroupDialog
          open onClose={() => setGroupDlg(null)} workspaceId={workspaceId} group={groupDlg.group}
          pocketCount={groups.find((x) => x.id === groupDlg.group?.id)?.pockets.length ?? 0}
          releaseCents={(groups.find((x) => x.id === groupDlg.group?.id)?.pockets ?? []).reduce((t, p) => t + Math.max(0, p.availableCents), 0)}
          onDelete={groupDlg.group ? async () => { const r = await archiveGroupAction(workspaceId, groupDlg.group!.id); return r.ok ? null : r.error; } : undefined}
        />
      )}
    </div>
    </ViewCtx.Provider>
  );
}
