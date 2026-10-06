"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronDown, Lock } from "lucide-react";
import { markYearReviewedAction, setReviewBulkAction, setReviewGroupAction, setReviewRowAction } from "@/app/actions/history";
import { typeLabel, typesFor } from "@/lib/budget/expense-types";
import { currentOf, filterGroups, type ReviewFilter, type ReviewGroup, type ReviewRow, type ReviewTotals } from "@/lib/history-review";
import { formatCents } from "@/lib/utils/currency";

interface Props { workspaceId: string; isBusiness: boolean; year: number; years: number[]; wsQuery: string; sealed: boolean; reviewedAt: string | null; groups: ReviewGroup[]; totals: ReviewTotals }
const TABS: { key: ReviewFilter; label: string }[] = [{ key: "all", label: "Everything" }, { key: "in", label: "Money in" }, { key: "out", label: "Money out" }, { key: "transfer", label: "Excluded" }, { key: "todo", label: "Needs a type" }];

export function ReviewClient({ workspaceId, isBusiness, year, years, wsQuery, sealed, reviewedAt, groups, totals }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<ReviewFilter>(totals.needsType > 0 ? "todo" : "all");
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const [selG, setSelG] = useState<Set<string>>(new Set());
  const [selR, setSelR] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState("TRANSFER");
  const shown = filterGroups(groups, tab, q);
  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const chosen = groups.filter((g) => selG.has(g.key));
  const count = selG.size + selR.size;
  const allShown = shown.length > 0 && shown.every((g) => selG.has(g.key));
  const dirs = new Set(chosen.map((g) => g.dir));
  const bulkOpts = dirs.size === 1 ? optionsFor([...dirs][0], isBusiness, "") : [];
  const applyBulk = () => start(async () => {
    const r = await setReviewBulkAction(workspaceId, year, chosen.map((g) => ({ payee: g.payee, dir: g.dir })), [...selR], bulk === "__none" ? "" : bulk);
    if (r.ok) { setErr(undefined); setSelG(new Set()); setSelR(new Set()); refresh(); } else setErr(r.error);
  });
  const go = (y: string) => router.push(`/history/review?${new URLSearchParams({ ...(wsQuery ? { ws: "business" } : {}), year: y })}`);
  const refresh = () => router.refresh();
  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label htmlFor="rv-year" className="label">Year</label>
            <select id="rv-year" className="input" value={year} onChange={(e) => go(e.target.value)}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
          </div>
          {sealed ? <span className="inline-flex min-h-11 items-center gap-1 text-sm text-slate-500"><Lock className="size-4" aria-hidden /> Sealed. Unseal on the History page to change.</span>
            : <button type="button" className={`btn min-h-11 ${reviewedAt ? "" : "btn-primary"}`} disabled={pending}
              onClick={() => start(async () => { const r = await markYearReviewedAction(workspaceId, year, !reviewedAt); if (r.ok) { setErr(undefined); refresh(); } else setErr(r.error); })}>
              {reviewedAt ? <><Check className="mr-1 inline size-4" aria-hidden /> Reviewed {reviewedAt} · undo</> : `Mark ${year} as reviewed`}</button>}
        </div>
        <dl className="nums grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <div><dt className="text-slate-500">{isBusiness ? "Revenue" : "Income"}</dt><dd className="font-semibold">{formatCents(totals.incomeCents)}</dd></div>
          <div><dt className="text-slate-500">Expenses</dt><dd className="font-semibold">{formatCents(totals.expenseCents)}</dd></div>
          <div><dt className="text-slate-500">Excluded (not counted)</dt><dd className="font-semibold">{formatCents(totals.transferCents)} <span className="text-xs font-normal text-slate-500">· {totals.transferCount}</span></dd></div>
          <div><dt className="text-slate-500">Rows</dt><dd className="font-semibold">{totals.rows.toLocaleString()}{totals.needsType > 0 && <span className="text-xs font-normal text-[#8A5A00]"> · {totals.needsType} need a type</span>}</dd></div>
        </dl>
        <p className="text-xs text-slate-500">Each line below is one payee. Change its type and every row from that payee in {year} follows. Open a line to fix single rows. Income and expense totals update as you go.</p>
        {err && <p role="alert" className="text-sm text-neg">{err}</p>}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Show">
        {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
          className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${tab === t.key ? "border-[#4F46E5] bg-[#4F46E5] text-white" : "border-[#E2E8F0] bg-white dark:border-slate-700 dark:bg-slate-900"}`}>{t.label}</button>)}
      </div>
      <div><label htmlFor="rv-q" className="label">Search payee or memo</label><input id="rv-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} /></div>

      <p className="text-sm text-slate-600 dark:text-slate-300"><span className="nums">{shown.length.toLocaleString()}</span> payee{shown.length === 1 ? "" : "s"} shown</p>
      {!sealed && shown.length > 0 && (
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="size-5" checked={allShown} onChange={() => setSelG((cur) => { const n = new Set(cur); for (const g of shown) { if (allShown) n.delete(g.key); else n.add(g.key); } return n; })} /> Select all {shown.length} shown</label>
      )}
      {count > 0 && (
        <div className="card sticky bottom-20 z-10 flex flex-wrap items-center gap-3 border-[#4F46E5] p-3" role="region" aria-label="Selected">
          <p className="nums text-sm font-semibold">{selG.size > 0 && `${selG.size} payee${selG.size === 1 ? "" : "s"}`}{selG.size > 0 && selR.size > 0 && " + "}{selR.size > 0 && `${selR.size} row${selR.size === 1 ? "" : "s"}`} selected</p>
          <select aria-label="Set selected to" className="input min-h-11 w-full sm:w-64" value={bulk} onChange={(e) => setBulk(e.target.value)}>
            <option value="TRANSFER">Exclude (transfer or not business)</option>
            {bulkOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            <option value="__none">Guess again from the wording</option>
          </select>
          <button type="button" className="btn btn-primary min-h-11" disabled={pending} onClick={applyBulk}>{pending ? "Saving…" : "Apply"}</button>
          <button type="button" className="btn min-h-11" disabled={pending} onClick={() => { setSelG(new Set()); setSelR(new Set()); }}>Clear</button>
        </div>
      )}
      <ul className="card divide-y divide-[#E2E8F0] dark:divide-slate-800">
        {shown.map((g) => <Group key={g.key} g={g} workspaceId={workspaceId} year={year} isBusiness={isBusiness} sealed={sealed} onDone={refresh} checked={selG.has(g.key)} onCheck={() => setSelG(toggle(selG, g.key))} selR={selR} onCheckRow={(id) => setSelR(toggle(selR, id))} />)}
        {shown.length === 0 && <li className="p-4 text-sm text-slate-500">{tab === "todo" ? "Nothing left without a type. Nicely done." : "Nothing matches."}</li>}
      </ul>
    </div>
  );
}

function optionsFor(dir: "in" | "out", isBusiness: boolean, current: string) {
  const base = dir === "in" ? typesFor("INCOME") : typesFor("EXPENSE").filter((t) => (t.group === "Business") === isBusiness);
  const list = base.map((t) => ({ key: t.key, label: t.label }));
  if (current && current !== "TRANSFER" && !list.some((o) => o.key === current)) list.unshift({ key: current, label: typeLabel(current) ?? current });
  return list;
}

function TypeSelect({ id, label, value, dir, isBusiness, disabled, onPick }: { id: string; label: string; value: string | null; dir: "in" | "out"; isBusiness: boolean; disabled: boolean; onPick: (v: string) => void }) {
  const opts = optionsFor(dir, isBusiness, value ?? "");
  return (
    <select id={id} aria-label={label} className="input min-h-11 w-full sm:w-60" disabled={disabled} value={value ?? "__mixed"} onChange={(e) => onPick(e.target.value === "__none" ? "" : e.target.value)}>
      {value === null && <option value="__mixed" disabled>Mixed: pick one for all</option>}
      {value === "" && <option value="">No type yet</option>}
      {opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      <option value="TRANSFER">Exclude (transfer or not business)</option>
      <option value="__none">Guess again from the wording</option>
    </select>
  );
}

function Group({ g, workspaceId, year, isBusiness, sealed, onDone, checked, onCheck, selR, onCheckRow }: { g: ReviewGroup; workspaceId: string; year: number; isBusiness: boolean; sealed: boolean; onDone: () => void; checked: boolean; onCheck: () => void; selR: Set<string>; onCheckRow: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const pick = (v: string) => start(async () => { const r = await setReviewGroupAction(workspaceId, year, g.payee, g.dir, v); if (r.ok) { setErr(undefined); onDone(); } else setErr(r.error); });
  return (
    <li className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!sealed && <input type="checkbox" className="size-5" aria-label={`Select ${g.payee || "no payee"} (${g.dir === "in" ? "money in" : "money out"})`} checked={checked} onChange={onCheck} />}
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate text-sm font-semibold">{g.payee || "(no payee)"}</p>
          <p className="nums text-xs text-slate-500">{g.count} row{g.count === 1 ? "" : "s"} · {g.dir === "in" ? "money in" : "money out"}{g.needsType > 0 && <span className="text-[#8A5A00]"> · {g.needsType} need a type</span>}</p>
        </div>
        <p className={`nums text-sm font-semibold ${g.totalCents > 0 ? "text-pos" : ""}`}>{formatCents(g.totalCents)}</p>
        <TypeSelect id={`g-${g.key}`} label={`Type for ${g.payee || "no payee"}`} value={g.current} dir={g.dir} isBusiness={isBusiness} disabled={sealed || pending} onPick={pick} />
        <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl" aria-expanded={open} aria-label={open ? "Hide rows" : "Show rows"} onClick={() => setOpen((o) => !o)}><ChevronDown className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden /></button>
      </div>
      {err && <p role="alert" className="mt-1 text-sm text-neg">{err}</p>}
      {open && <ul className="mt-2 divide-y divide-[#E2E8F0] rounded-xl bg-slate-50 dark:divide-slate-700 dark:bg-slate-800">{g.rows.map((r) => <RowLine key={r.id} r={r} dir={g.dir} workspaceId={workspaceId} isBusiness={isBusiness} sealed={sealed} onDone={onDone} checked={selR.has(r.id)} onCheck={() => onCheckRow(r.id)} />)}</ul>}
    </li>
  );
}

function RowLine({ r, dir, workspaceId, isBusiness, sealed, onDone, checked, onCheck }: { r: ReviewRow; dir: "in" | "out"; workspaceId: string; isBusiness: boolean; sealed: boolean; onDone: () => void; checked: boolean; onCheck: () => void }) {
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 p-2">
      {!sealed && <input type="checkbox" className="size-5" aria-label={`Select ${r.date} ${formatCents(r.amountCents)}`} checked={checked} onChange={onCheck} />}
      <div className="min-w-0 flex-1 basis-40">
        <p className="nums text-xs text-slate-500">{r.date} · {r.account}</p>
        {r.memo && <p className="truncate text-xs text-slate-500">{r.memo}</p>}
        {err && <p role="alert" className="text-xs text-neg">{err}</p>}
      </div>
      <p className={`nums text-sm font-semibold ${r.amountCents > 0 ? "text-pos" : ""}`}>{formatCents(r.amountCents)}</p>
      <TypeSelect id={`r-${r.id}`} label={`Type for ${r.date} ${formatCents(r.amountCents)}`} value={currentOf(r)} dir={dir} isBusiness={isBusiness} disabled={sealed || pending}
        onPick={(v) => start(async () => { const x = await setReviewRowAction(workspaceId, r.id, v); if (x.ok) { setErr(undefined); onDone(); } else setErr(x.error); })} />
    </li>
  );
}
