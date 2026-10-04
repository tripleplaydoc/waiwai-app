"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FolderOpen, Paperclip, ScanLine, X } from "lucide-react";
import { ReceiptScanner } from "@/components/receipt-scanner";

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

/** A real <input type=file name="receipt"> so the surrounding form submits it natively. Photos go through the scanner first. */
export function ReceiptField({ label = "Receipt", id = "receipt", compact = false, onReady }: { label?: string; id?: string; compact?: boolean; onReady?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState<File | null>(null);

  function setFinal(out: File) {
    const input = ref.current;
    if (!input) return;
    const dt = new DataTransfer(); dt.items.add(out); input.files = dt.files;
    setName(`${out.name} · ${out.size >= 1024 * 1024 ? (out.size / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(out.size / 1024)) + " KB"}`);
    onReady?.();
  }

  // Both pickers land here: PDFs go straight in, images open the scanner.
  async function picked(f: File | undefined) {
    if (!f) return;
    if (f.type.startsWith("image/") && f.type !== "image/gif" && typeof createImageBitmap === "function") { setScanning(f); return; }
    setBusy(true); setFinal(await shrink(f)); setBusy(false);
  }
  async function scanned(out: File | null) {
    const original = scanning;
    setScanning(null);
    if (out) { setFinal(out); }
    else if (original) { setBusy(true); setFinal(await shrink(original)); setBusy(false); }
    if (camera.current) camera.current.value = "";
  }
  // Native listener (not React's onChange) so picking the same file twice still fires.
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const h = () => {
      const f = input.files?.[0];
      if (f && f.type.startsWith("image/") && f.type !== "image/gif") input.value = "";
      void pickedRef.current(f);
    };
    input.addEventListener("change", h);
    return () => input.removeEventListener("change", h);
  }, []);
  function clear() { if (ref.current) ref.current.value = ""; if (camera.current) camera.current.value = ""; setName(undefined); }

  return (
    <div>
      {!compact && <label htmlFor={id} className="label">{label} <span className="font-normal text-slate-400">(scan, photo or PDF, optional)</span></label>}
      {/* The real field the form submits. Choosing a file here also goes through the scanner. */}
      <input ref={ref} id={id} name="receipt" type="file" accept="image/*,application/pdf" className="sr-only" />
      {/* Phone camera: opens the rear camera directly. No name, so it never submits on its own. */}
      <input ref={camera} type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden onChange={(e) => void picked(e.currentTarget.files?.[0])} className="sr-only" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-sm" onClick={() => camera.current?.click()}>
          <ScanLine className="size-4" aria-hidden /> {name ? "Rescan" : "Scan receipt"}
        </button>
        <label htmlFor={id} className="btn btn-sm cursor-pointer">
          {name ? <Paperclip className="size-4" aria-hidden /> : <FolderOpen className="size-4" aria-hidden />} {compact ? "Attach file" : "Choose file"}
        </label>
        {busy && <span className="text-xs text-slate-500">Preparing…</span>}
        {name && !busy && (
          <span className="flex min-w-0 items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            <span className="truncate">{name}</span>
            <button type="button" onClick={clear} aria-label="Remove receipt" className="flex size-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="size-3.5" /></button>
          </span>
        )}
      </div>
      {scanning && <ReceiptScanner file={scanning} onDone={scanned} onCancel={() => { setScanning(null); if (camera.current) camera.current.value = ""; }} />}
    </div>
  );
}
