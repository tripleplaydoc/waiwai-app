"use client";

import { useRef, useState } from "react";
import { Camera, Paperclip, X } from "lucide-react";

const MAX_EDGE = 1600;

/** Downscales big phone photos to a ~300 KB JPEG so uploads are quick and storage stays small. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // e.g. HEIC the browser can't decode: send as-is
  }
}

/** A real <input type=file name="receipt"> so the surrounding form submits it natively. */
export function ReceiptField({ label = "Receipt", id = "receipt", compact = false, onReady }: { label?: string; id?: string; compact?: boolean; onReady?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const f = input.files?.[0];
    if (!f) { setName(undefined); return; }
    setBusy(true);
    const out = await shrink(f);
    if (out !== f) { const dt = new DataTransfer(); dt.items.add(out); input.files = dt.files; }
    setName(`${out.name} · ${out.size >= 1024 * 1024 ? (out.size / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(out.size / 1024)) + " KB"}`);
    setBusy(false);
    onReady?.();
  }
  function clear() { if (ref.current) ref.current.value = ""; setName(undefined); }

  return (
    <div>
      {!compact && <label htmlFor={id} className="label">{label} <span className="font-normal text-slate-400">(photo or PDF, optional)</span></label>}
      <input ref={ref} id={id} name="receipt" type="file" accept="image/*,application/pdf" onChange={onChange} className="sr-only" />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="btn btn-sm cursor-pointer">
          {name ? <Paperclip className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />} {name ? "Change" : compact ? "Attach receipt" : "Add receipt"}
        </label>
        {busy && <span className="text-xs text-slate-500">Preparing…</span>}
        {name && !busy && (
          <span className="flex min-w-0 items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            <span className="truncate">{name}</span>
            <button type="button" onClick={clear} aria-label="Remove receipt" className="flex size-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="size-3.5" /></button>
          </span>
        )}
      </div>
    </div>
  );
}
