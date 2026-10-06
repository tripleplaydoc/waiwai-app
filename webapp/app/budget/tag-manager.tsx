"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { addSuggestedTagsAction, createTagAction, deleteTagAction, updateTagAction } from "@/app/actions/pocket-tags";
import { TAG_COLORS, tagBg, type TagVM } from "@/lib/budget/tags";

export function TagChip({ tag, small }: { tag: TagVM; small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold text-slate-800 dark:text-slate-100 ${small ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"}`} style={{ backgroundColor: tagBg(tag.color) }}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden />{tag.name}
    </span>
  );
}

function Swatches({ value, onPick, label }: { value: string; onPick: (hex: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {TAG_COLORS.map((c) => (
        <button key={c.hex} type="button" role="radio" aria-checked={value.toUpperCase() === c.hex} aria-label={c.name} onClick={() => onPick(c.hex)}
          className="flex size-9 items-center justify-center rounded-full ring-offset-2 focus-visible:ring-2 aria-checked:ring-2 ring-slate-400 dark:ring-offset-slate-900" style={{ backgroundColor: c.hex }}>
          {value.toUpperCase() === c.hex && <Check className="size-4 text-white" aria-hidden />}
        </button>
      ))}
      <label className="ml-1 flex min-h-9 cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <input type="color" aria-label="Pick any colour" value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#4F46E5"} onChange={(e) => onPick(e.target.value.toUpperCase())} className="size-8 cursor-pointer rounded border-0 bg-transparent p-0" /> Any colour
      </label>
    </div>
  );
}

function TagRow({ workspaceId, tag, onDone }: { workspaceId: string; tag: TagVM; onDone: () => void }) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const dirty = name !== tag.name || color.toUpperCase() !== tag.color.toUpperCase();
  const save = () => start(async () => { const r = await updateTagAction(workspaceId, tag.id, name, color); if (r.ok) { setErr(undefined); onDone(); } else setErr(r.error); });
  const del = () => { if (confirm(`Delete the tag “${tag.name}”? It is only removed from pockets; nothing else changes.`)) start(async () => { const r = await deleteTagAction(workspaceId, tag.id); if (r.ok) onDone(); else setErr(r.error); }); };
  return (
    <li className="space-y-2 rounded-xl border border-[#E2E8F0] p-3 dark:border-slate-700">
      <div className="flex items-center gap-2">
        <span className="size-5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
        <input aria-label={`Name of ${tag.name}`} className="input min-h-11 flex-1" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" aria-label={`Delete ${tag.name}`} className="flex size-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" disabled={pending} onClick={del}><Trash2 className="size-4" aria-hidden /></button>
      </div>
      <Swatches value={color} onPick={setColor} label={`Colour for ${tag.name}`} />
      {(dirty || err) && (
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <button type="button" className="btn btn-primary min-h-11" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>}
          {err && <p role="alert" className="text-sm text-neg">{err}</p>}
        </div>
      )}
    </li>
  );
}

/** Add, rename, recolour and delete your pocket tags. */
export function TagManager({ open, onClose, workspaceId, tags }: { open: boolean; onClose: () => void; workspaceId: string; tags: TagVM[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(TAG_COLORS[0].hex);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const refresh = () => router.refresh();
  const add = () => start(async () => { const r = await createTagAction(workspaceId, name, color); if (r.ok) { setName(""); setErr(undefined); refresh(); } else setErr(r.error); });
  const suggested = () => start(async () => { const r = await addSuggestedTagsAction(workspaceId); if (r.ok) refresh(); else setErr(r.error); });
  return (
    <Modal open={open} onClose={onClose} title="Pocket tags">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">Tags are your own colour labels. Put them on pockets to see at a glance what is what. Add as many as you like and change them any time.</p>
        {tags.length === 0 && (
          <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <p>No tags yet. Start with a few common ones?</p>
            <button type="button" className="btn mt-2 min-h-11" disabled={pending} onClick={suggested}>Add Fixed, Variable, Loan and Payroll</button>
          </div>
        )}
        <ul className="space-y-2">{tags.map((t) => <TagRow key={`${t.id}-${t.name}-${t.color}`} workspaceId={workspaceId} tag={t} onDone={refresh} />)}</ul>
        <div className="space-y-2 rounded-xl border border-dashed border-[#CBD5E1] p-3 dark:border-slate-700">
          <label htmlFor="tg-new" className="label">New tag</label>
          <input id="tg-new" className="input min-h-11" maxLength={24} placeholder="e.g. Subscription" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <Swatches value={color} onPick={setColor} label="Colour for the new tag" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary min-h-11" disabled={pending || !name.trim()} onClick={add}>{pending ? "Adding…" : "Add tag"}</button>
            {err && <p role="alert" className="text-sm text-neg">{err}</p>}
          </div>
        </div>
        <div className="flex justify-end"><button type="button" className="btn min-h-11" onClick={onClose}>Done</button></div>
      </div>
    </Modal>
  );
}
