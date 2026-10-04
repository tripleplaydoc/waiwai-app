"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { archivePocketAction, saveGroupAction, savePocketAction } from "@/app/actions/pockets";
import { centsToInput, formatCents, parseToCents } from "@/lib/utils/currency";
import { monthsBetweenInclusive } from "@/lib/budget/dates";
import type { PocketVM } from "@/lib/budget/board-types";
import { typesFor, typeLabel } from "@/lib/budget/expense-types";

type TT = "NONE" | "MONTHLY_FUNDING" | "TARGET_BALANCE" | "TARGET_BALANCE_BY_DATE";

const KINDS: { value: TT; label: string; hint: string }[] = [
  { value: "NONE", label: "No target", hint: "Just a place to hold money." },
  { value: "MONTHLY_FUNDING", label: "Monthly cost", hint: "A bill or spending amount you need every month." },
  { value: "TARGET_BALANCE_BY_DATE", label: "Goal by a date", hint: "Save a total amount by a deadline." },
  { value: "TARGET_BALANCE", label: "Goal to reach", hint: "Build up to a balance and keep it there." },
];

export function PocketDialog({
  open, onClose, workspaceId, isBusiness, groups, pocket, defaultGroupId, monthIso, kindOfNew, customTypes = [],
}: {
  customTypes?: string[];
  open: boolean; onClose: () => void; workspaceId: string; isBusiness: boolean;
  groups: { id: string; name: string }[]; pocket: PocketVM | null; defaultGroupId?: string;
  monthIso: string; kindOfNew?: "EXPENSE" | "INCOME";
}) {
  const editing = pocket !== null;
  const isIncome = editing ? pocket.kind === "INCOME" : kindOfNew === "INCOME";
  const realGroups = groups.filter((g) => g.id !== "__none");
  const [state, action, pending] = useActionState(savePocketAction, undefined);
  const [groupChoice, setGroupChoice] = useState(pocket?.groupId ?? defaultGroupId ?? realGroups[0]?.id ?? "__new");
  const [kind, setKind] = useState<TT>(pocket?.targetType ?? "NONE");
  const [amount, setAmount] = useState(pocket?.targetCents ? centsToInput(pocket.targetCents) : "");
  const [date, setDate] = useState(pocket?.targetDate ?? "");
  const [etype, setEtype] = useState(pocket?.expenseType ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string>();

  useEffect(() => { if (state?.ok) onClose(); }, [state, onClose]);

  const startBalance = pocket ? pocket.availableCents - pocket.assignedCents - pocket.activityCents : 0;
  let preview = "";
  const cents = parseToCents(amount);
  if (cents && cents > 0) {
    if (kind === "MONTHLY_FUNDING") preview = `Needs ${formatCents(cents)} every month.`;
    if (kind === "TARGET_BALANCE") preview = `Keeps a balance of ${formatCents(cents)}.`;
    if (kind === "TARGET_BALANCE_BY_DATE" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const months = monthsBetweenInclusive(new Date(`${monthIso}-01T00:00:00.000Z`), new Date(`${date}T00:00:00.000Z`));
      const per = Math.ceil(Math.max(0, cents - startBalance) / months);
      preview = `Save about ${formatCents(per)} a month for ${months} month${months === 1 ? "" : "s"}.`;
    }
  }
  const system = pocket?.isSystemManaged ?? false;

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${pocket.name}` : isIncome ? "Add income source" : "Add pocket"}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        {editing && <input type="hidden" name="id" value={pocket.id} />}
        {!editing && <input type="hidden" name="type" value={isIncome ? "INCOME" : "EXPENSE"} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pk-name" className="label">Name</label>
            <input id="pk-name" name="name" required maxLength={80} defaultValue={pocket?.name ?? ""} disabled={system} className="input" />
            {system && <input type="hidden" name="name" value={pocket?.name} />}
          </div>
          <div>
            <label htmlFor="pk-group" className="label">Category</label>
            <select id="pk-group" name="groupId" className="input" value={groupChoice} onChange={(e) => setGroupChoice(e.target.value)} disabled={system}>
              {realGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value="__new">+ New category…</option>
            </select>
            {system && <input type="hidden" name="groupId" value={groupChoice} />}
          </div>
        </div>
        {groupChoice === "__new" && (
          <div>
            <label htmlFor="pk-newgroup" className="label">New category name</label>
            <input id="pk-newgroup" name="newGroupName" maxLength={80} className="input" />
          </div>
        )}

        {!system && (
          <div>
            <label htmlFor="pk-type" className="label">Type <span className="font-normal text-slate-400">(for your P&amp;L)</span></label>
            <select id="pk-type" name="expenseType" className="input" value={etype} onChange={(e) => setEtype(e.target.value)}>
              <option value="">Not classified</option>
              {etype && !customTypes.includes(etype) && etype.startsWith("CUSTOM:") && <option value={etype}>{typeLabel(etype)}</option>}
              {customTypes.length > 0 && (
                <optgroup label="Your custom types">
                  {customTypes.map((k) => <option key={k} value={k}>{typeLabel(k)}</option>)}
                </optgroup>
              )}
              <option value="__new">+ Add a custom type…</option>
              {isIncome ? typesFor("INCOME").map((t) => <option key={t.key} value={t.key}>{t.label}</option>) : (
                (isBusiness ? (["Business", "Personal"] as const) : (["Personal", "Business"] as const)).map((g) => (
                  <optgroup key={g} label={g === "Business" ? "Business expenses" : "Personal & everyday"}>
                    {typesFor("EXPENSE").filter((t) => t.group === g).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </optgroup>
                ))
              )}
            </select>
            {etype === "__new" && (
              <input name="customType" required maxLength={40} autoFocus placeholder={isIncome ? "e.g. Speaking fees" : "e.g. Lab testing"} className="input mt-2" aria-label="Custom type name" />
            )}
          </div>
        )}

        {!isIncome && (
          <fieldset>
            <legend className="label">What does this pocket need?</legend>
            <input type="hidden" name="targetType" value={kind} />
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Target type">
              {KINDS.map((k) => (
                <button
                  key={k.value} type="button" role="radio" aria-checked={kind === k.value}
                  onClick={() => setKind(k.value)}
                  className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    kind === k.value
                      ? "border-[#2E6BE6] bg-blue-50 text-[#1E4FBF] dark:bg-blue-950/50 dark:text-blue-200"
                      : "border-[#E2E8F0] hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="block font-medium">{k.label}</span>
                  <span className="block text-[11px] leading-tight opacity-70">{k.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {!isIncome && kind !== "NONE" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pk-amount" className="label">{kind === "MONTHLY_FUNDING" ? "Cost per month" : "Goal amount"}</label>
              <input id="pk-amount" name="amount" inputMode="decimal" required placeholder="500.00" className="input nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            {kind === "TARGET_BALANCE_BY_DATE" && (
              <div>
                <label htmlFor="pk-date" className="label">Reach it by</label>
                <input id="pk-date" name="targetDate" type="date" required className="input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
          </div>
        )}
        {preview && <p className="rounded-xl bg-blue-50 px-4 py-2.5 text-sm text-[#1E4FBF] dark:bg-blue-950/40 dark:text-blue-200">{preview}</p>}

        {!isIncome && (
          <div>
            <label htmlFor="pk-due" className="label">Due day of the month <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="pk-due" name="dueDay" type="number" min={1} max={31} inputMode="numeric" placeholder="e.g. 15" defaultValue={pocket?.dueDay ?? ""} className="input nums sm:max-w-40" />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">For bills and expenses with a due date. You&apos;ll see Due soon / Overdue / Paid, and can tap Mark paid.</p>
          </div>
        )}

        {!isIncome && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pk-rank" className="label">Auto-assign priority <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="pk-rank" name="priorityRank" inputMode="numeric" placeholder="1 = funded first" defaultValue={pocket?.priorityRank ?? ""} className="input nums" />
            </div>
            {isBusiness && (
              <label className="flex min-h-11 items-center gap-3 self-end text-sm">
                <input type="checkbox" name="isTaxDeductible" defaultChecked={pocket?.isTaxDeductible} className="size-5" /> Tax-deductible
              </label>
            )}
          </div>
        )}

        {state && !state.ok && <p role="alert" className="text-sm text-[#C9372C]">{state.error}</p>}
        {deleteError && <p role="alert" className="text-sm text-[#C9372C]">{deleteError}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {editing && !system && (
            confirmDelete ? (
              <span className="mr-auto flex items-center gap-2 text-sm">
                Delete this pocket?
                <button
                  type="button" className="btn btn-sm !border-[#C9372C] !text-[#C9372C]" disabled={deleting}
                  onClick={() => startDelete(async () => {
                    const r = await archivePocketAction(workspaceId, pocket.id);
                    if (r.ok) onClose(); else setDeleteError(r.error);
                  })}
                >Yes, delete</button>
                <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(false)}>Keep</button>
              </span>
            ) : (
              <button type="button" className="btn btn-sm mr-auto" onClick={() => setConfirmDelete(true)}>Delete</button>
            )
          )}
          <button type="button" className="btn" onClick={onClose}>Cancel <span className="kbd">Esc</span></button>
          <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Add pocket"}</button>
        </div>
      </form>
    </Modal>
  );
}

export function GroupDialog({
  open, onClose, workspaceId, group, onDelete,
}: { open: boolean; onClose: () => void; workspaceId: string; group: { id: string; name: string } | null; onDelete?: () => Promise<string | null> }) {
  const [state, action, pending] = useActionState(saveGroupAction, undefined);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (state?.ok) onClose(); }, [state, onClose]);
  return (
    <Modal open={open} onClose={onClose} title={group ? `Edit ${group.name}` : "Add category"}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        {group && <input type="hidden" name="id" value={group.id} />}
        <div>
          <label htmlFor="gr-name" className="label">Category name</label>
          <input id="gr-name" name="name" required maxLength={80} defaultValue={group?.name ?? ""} className="input" placeholder="e.g. Needs, Wants, Savings" />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Categories hold your pockets. Drag them to reorder.</p>
        </div>
        {state && !state.ok && <p role="alert" className="text-sm text-[#C9372C]">{state.error}</p>}
        {error && <p role="alert" className="text-sm text-[#C9372C]">{error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {group && onDelete && (
            confirm ? (
              <span className="mr-auto flex items-center gap-2 text-sm">
                Delete this category?
                <button type="button" className="btn btn-sm !border-[#C9372C] !text-[#C9372C]" onClick={async () => { const e = await onDelete(); if (e) setError(e); else onClose(); }}>Yes, delete</button>
                <button type="button" className="btn btn-sm" onClick={() => setConfirm(false)}>Keep</button>
              </span>
            ) : <button type="button" className="btn btn-sm mr-auto" onClick={() => setConfirm(true)}>Delete</button>
          )}
          <button type="button" className="btn" onClick={onClose}>Cancel <span className="kbd">Esc</span></button>
          <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}
