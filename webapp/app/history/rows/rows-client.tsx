"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { addHistoryRowAction, deleteHistoryRowAction, updateHistoryRowAction } from "@/app/actions/history";
import { typeLabel, typesFor } from "@/lib/budget/expense-types";
import { centsToInput, formatCents } from "@/lib/utils/currency";

export interface RowVM { id: string; accountId: string; account: string; date: string; amountCents: number; payee: string; memo: string; kind: string; typeKey: string | null; sealed: boolean }
interface Props {
  workspaceId: string; isBusiness: boolean; rows: RowVM[]; total: number; page: number; pageSize: number;
  accounts: { id: string; name: string }[]; filters: { account: string; year: string; q: string; todo: boolean }; wsQuery: string;
}

export function RowsClient({ workspaceId, isBusiness, rows, total, page, pageSize, accounts, filters, wsQuery }: Props) {
  const router = useRouter();
  const [f, setF] = useState(filters);
  const opts = [...typesFor("EXPENSE").filter((t) => (t.group === "Business") === isBusiness), ...typesFor("INCOME")];
  const href = (p: number) => {
    const u = new URLSearchParams(wsQuery.replace("?", ""));
    if (f.account) u.set("account", f.account); if (f.year) u.set("year", f.year); if (f.q) u.set("q", f.q); if (f.todo) u.set("todo", "1"); if (p > 1) u.set("page", String(p));
    return `/history/rows?${u}`;
  };
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-4">
      <form className="card grid gap-3 p-4 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); router.push(href(1)); }}>
        <div><label htmlFor="rf-acct" className="label">Account</label><select id="rf-acct" className="input" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}><option value="">All</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div><label htmlFor="rf-year" className="label">Year</label><input id="rf-year" inputMode="numeric" className="input nums" placeholder="All" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></div>
        <div><label htmlFor="rf-q" className="label">Payee or memo</label><input id="rf-q" className="input" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <div className="flex items-end gap-3">
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={f.todo} onChange={(e) => setF({ ...f, todo: e.target.checked })} /> Needs a type</label>
          <button className="btn btn-primary min-h-11" type="submit">Filter</button>
        </div>
      </form>

      <AddRow workspaceId={workspaceId} accounts={accounts} opts={opts} onDone={() => router.refresh()} />

      <p className="text-sm text-slate-600 dark:text-slate-300"><span className="nums">{total.toLocaleString()}</span> row{total === 1 ? "" : "s"}</p>
      <ul className="card divide-y divide-[#E2E8F0] dark:divide-slate-800">
        {rows.map((r) => <Row key={r.id} r={r} workspaceId={workspaceId} opts={opts} onDone={() => router.refresh()} />)}
        {rows.length === 0 && <li className="p-4 text-sm text-slate-500">No rows match.</li>}
      </ul>
      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pages">
          {page > 1 ? <Link className="btn min-h-11" href={href(page - 1)}>← Newer</Link> : <span />}
          <span className="nums text-slate-500">Page {page} of {pages}</span>
          {page < pages ? <Link className="btn min-h-11" href={href(page + 1)}>Older →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

type Opt = { key: string; label: string };

function Row({ r, workspaceId, opts, onDone }: { r: RowVM; workspaceId: string; opts: Opt[]; onDone: () => void }) {
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState({ date: r.date, payee: r.payee, memo: r.memo, amount: centsToInput(Math.abs(r.amountCents)), direction: (r.amountCents < 0 ? "out" : "in") as "out" | "in", typeKey: r.kind === "TRANSFER" ? "TRANSFER" : r.typeKey ?? "" });
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const save = () => start(async () => { const x = await updateHistoryRowAction(workspaceId, r.id, { accountId: r.accountId, ...d }); if (x.ok) { setEdit(false); onDone(); } else setErr(x.error); });
  const del = () => { if (confirm("Delete this history row?")) start(async () => { const x = await deleteHistoryRowAction(workspaceId, r.id); if (x.ok) onDone(); else setErr(x.error); }); };
  return (
    <li className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{r.payee || "(no payee)"}</p>
          <p className="nums text-xs text-slate-500">{r.date} · {r.account} · {r.kind === "TRANSFER" ? "Excluded" : typeLabel(r.typeKey) ?? "No type yet"}</p>
          {r.memo && <p className="truncate text-xs text-slate-400">{r.memo}</p>}
        </div>
        <div className="text-right">
          <p className={`nums text-sm font-semibold ${r.amountCents > 0 ? "text-pos" : ""}`}>{formatCents(r.amountCents)}</p>
          {r.sealed ? <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Lock className="size-3" aria-hidden /> Sealed</span>
            : <button type="button" className="min-h-11 px-2 text-xs font-semibold text-blue-700 dark:text-blue-300" onClick={() => setEdit((e) => !e)}>{edit ? "Close" : "Edit"}</button>}
        </div>
      </div>
      {edit && (
        <div className="mt-2 grid gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800 sm:grid-cols-2">
          <div><label className="label" htmlFor={`e-d-${r.id}`}>Date</label><input id={`e-d-${r.id}`} type="date" className="input" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
          <div><label className="label" htmlFor={`e-a-${r.id}`}>Amount</label>
            <div className="flex gap-2"><select aria-label="Direction" className="input w-24" value={d.direction} onChange={(e) => setD({ ...d, direction: e.target.value as "out" | "in" })}><option value="out">Out</option><option value="in">In</option></select>
              <input id={`e-a-${r.id}`} inputMode="decimal" className="input nums" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} /></div></div>
          <div><label className="label" htmlFor={`e-p-${r.id}`}>Payee</label><input id={`e-p-${r.id}`} className="input" value={d.payee} onChange={(e) => setD({ ...d, payee: e.target.value })} /></div>
          <div><label className="label" htmlFor={`e-t-${r.id}`}>Type</label>
            <select id={`e-t-${r.id}`} className="input" value={d.typeKey} onChange={(e) => setD({ ...d, typeKey: e.target.value })}><option value="">Guess from the payee</option>{opts.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}<option value="TRANSFER">Exclude (transfer or not business)</option></select></div>
          <div className="sm:col-span-2"><label className="label" htmlFor={`e-m-${r.id}`}>Memo</label><input id={`e-m-${r.id}`} className="input" value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} /></div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="button" className="btn btn-primary min-h-11" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
            <button type="button" className="btn min-h-11" disabled={pending} onClick={del}>Delete</button>
            {err && <p role="alert" className="self-center text-sm text-neg">{err}</p>}
          </div>
        </div>
      )}
    </li>
  );
}

function AddRow({ workspaceId, accounts, opts, onDone }: { workspaceId: string; accounts: { id: string; name: string }[]; opts: Opt[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const blank = { accountId: accounts[0]?.id ?? "", date: "", payee: "", memo: "", amount: "", direction: "out" as "out" | "in", typeKey: "" };
  const [d, setD] = useState(blank);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  if (!open) return <button type="button" className="btn min-h-11" onClick={() => setOpen(true)}>Add a row by hand</button>;
  return (
    <div className="card grid gap-2 p-4 sm:grid-cols-2">
      <div><label className="label" htmlFor="ar-acct">Account</label><select id="ar-acct" className="input" value={d.accountId} onChange={(e) => setD({ ...d, accountId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      <div><label className="label" htmlFor="ar-date">Date</label><input id="ar-date" type="date" className="input" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
      <div><label className="label" htmlFor="ar-pay">Payee</label><input id="ar-pay" className="input" value={d.payee} onChange={(e) => setD({ ...d, payee: e.target.value })} /></div>
      <div><label className="label" htmlFor="ar-amt">Amount</label><div className="flex gap-2"><select aria-label="Direction" className="input w-24" value={d.direction} onChange={(e) => setD({ ...d, direction: e.target.value as "out" | "in" })}><option value="out">Out</option><option value="in">In</option></select><input id="ar-amt" inputMode="decimal" className="input nums" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} /></div></div>
      <div><label className="label" htmlFor="ar-type">Type</label><select id="ar-type" className="input" value={d.typeKey} onChange={(e) => setD({ ...d, typeKey: e.target.value })}><option value="">Guess from the payee</option>{opts.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}<option value="TRANSFER">Exclude (transfer or not business)</option></select></div>
      <div><label className="label" htmlFor="ar-memo">Memo</label><input id="ar-memo" className="input" value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} /></div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="button" className="btn btn-primary min-h-11" disabled={pending} onClick={() => start(async () => { const x = await addHistoryRowAction(workspaceId, d); if (x.ok) { setD(blank); setErr(undefined); onDone(); } else setErr(x.error); })}>{pending ? "Adding…" : "Add row"}</button>
        <button type="button" className="btn min-h-11" onClick={() => setOpen(false)}>Close</button>
        {err && <p role="alert" className="self-center text-sm text-neg">{err}</p>}
      </div>
    </div>
  );
}
