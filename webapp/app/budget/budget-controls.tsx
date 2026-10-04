"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Plus, Wand2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { autoAssignAction, createCategoryAction, setAssignedAction } from "@/app/actions/budget";

export function AssignedInput({ categoryId, month, initial, label }: { categoryId: string; month: string; initial: string; label: string }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  // Server data changed (after save / month change): show the saved value.
  useEffect(() => { setValue(initial); setError(undefined); }, [initial]);

  function commit() {
    if (value.trim() === initial) return;
    const fd = new FormData();
    fd.set("categoryId", categoryId);
    fd.set("month", month);
    fd.set("amount", value);
    start(async () => {
      const r = await setAssignedAction(fd);
      if (!r.ok) setError(r.error);
      else setError(undefined);
    });
  }

  return (
    <div className="inline-flex flex-col items-end">
      <input
        ref={ref}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        title={error}
        inputMode="decimal"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setValue(initial); setError(undefined); e.currentTarget.blur(); }
        }}
        className={`input nums !min-h-10 w-32 text-right ${error ? "!border-[#DC2626]" : ""}`}
      />
      {error && <span role="alert" className="mt-1 text-[11px] text-[#DC2626]">{error}</span>}
    </div>
  );
}

export function AutoAssignButton({ workspaceId, month }: { workspaceId: string; month: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("workspaceId", workspaceId);
          fd.set("month", month);
          start(async () => {
            const r = await autoAssignAction(fd);
            setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
          });
        }}
      >
        <Wand2 className="size-4" aria-hidden /> {pending ? "Assigning…" : "Auto-assign"}
      </button>
      {msg && <span role="status" className={`text-xs ${msg.ok ? "text-[#059669]" : "text-[#DC2626]"}`}>{msg.text}</span>}
    </div>
  );
}

export function AddCategoryButton({ workspaceId, isBusiness, groups }: { workspaceId: string; isBusiness: boolean; groups: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createCategoryAction, undefined);
  const [groupChoice, setGroupChoice] = useState(groups[0]?.id ?? "__new");
  const [type, setType] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) { setOpen(false); formRef.current?.reset(); }
  }, [state]);

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Add category
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add category">
        <form ref={formRef} action={action} className="space-y-3">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <div>
            <label htmlFor="cat-name" className="label">Name</label>
            <input id="cat-name" name="name" required maxLength={80} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cat-type" className="label">Type</label>
              <select id="cat-type" name="type" className="input" value={type} onChange={(e) => setType(e.target.value as "EXPENSE" | "INCOME")}>
                <option value="EXPENSE">Spending envelope</option>
                <option value="INCOME">Income source</option>
              </select>
            </div>
            <div>
              <label htmlFor="cat-group" className="label">Group</label>
              <select id="cat-group" name="groupId" className="input" value={groupChoice} onChange={(e) => setGroupChoice(e.target.value)}>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                <option value="__new">+ New group…</option>
              </select>
            </div>
          </div>
          {groupChoice === "__new" && (
            <div>
              <label htmlFor="cat-newgroup" className="label">New group name</label>
              <input id="cat-newgroup" name="newGroupName" maxLength={80} className="input" />
            </div>
          )}
          {type === "EXPENSE" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cat-target" className="label">Monthly target (optional)</label>
                  <input id="cat-target" name="target" inputMode="decimal" placeholder="500.00" className="input nums" />
                </div>
                <div>
                  <label htmlFor="cat-rank" className="label">Auto-assign priority (optional)</label>
                  <input id="cat-rank" name="priorityRank" inputMode="numeric" placeholder="1 = funded first" className="input nums" />
                </div>
              </div>
              {isBusiness && (
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" name="isTaxDeductible" className="size-5" /> Tax-deductible business expense
                </label>
              )}
            </>
          )}
          {state && !state.ok && <p role="alert" className="text-sm text-[#DC2626]">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel <span className="kbd">Esc</span></button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save category"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
