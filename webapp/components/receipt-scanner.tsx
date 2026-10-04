"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ScanLine, Wand2, X } from "lucide-react";
import { applyFilter, defaultQuad, detectQuad, outputSize, warpPerspective, type Pt, type ScanFilter } from "@/lib/scan/geometry";

const ANALYZE_EDGE = 400;
const SOURCE_EDGE = 3000;
const FILTERS: { key: ScanFilter; label: string }[] = [
  { key: "bw", label: "Black & white" },
  { key: "gray", label: "Enhanced" },
  { key: "color", label: "Color" },
];

function canvasOf(w: number, h: number) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

/**
 * Full-screen receipt scanner: finds the paper's edges, lets you nudge the 4 corners,
 * straightens the perspective and cleans it to crisp black & white. All on-device.
 */
export function ReceiptScanner({ file, onDone, onCancel }: { file: File; onDone: (scanned: File | null) => void; onCancel: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [failed, setFailed] = useState(false);
  const [quad, setQuad] = useState<Pt[]>(defaultQuad());
  const [found, setFound] = useState(true);
  const [filter, setFilter] = useState<ScanFilter>("bw");
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const srcPixels = useRef<{ data: Uint8ClampedArray; w: number; h: number } | null>(null);
  const drag = useRef<number | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });

  useEffect(() => setMounted(true), []);

  // Load the photo, respecting EXIF rotation, capped so big phone shots stay fast.
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        let b = await createImageBitmap(file, { imageOrientation: "from-image" });
        const s = Math.min(1, SOURCE_EDGE / Math.max(b.width, b.height));
        if (s < 1) b = await createImageBitmap(b, { resizeWidth: Math.round(b.width * s), resizeHeight: Math.round(b.height * s), resizeQuality: "high" });
        if (dead) return;
        const c = canvasOf(b.width, b.height);
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(b, 0, 0);
        srcPixels.current = { data: ctx.getImageData(0, 0, b.width, b.height).data, w: b.width, h: b.height };
        const a = Math.min(1, ANALYZE_EDGE / Math.max(b.width, b.height));
        const aw = Math.max(8, Math.round(b.width * a)), ah = Math.max(8, Math.round(b.height * a));
        const ac = canvasOf(aw, ah);
        const actx = ac.getContext("2d", { willReadFrequently: true })!;
        actx.drawImage(b, 0, 0, aw, ah);
        const q = detectQuad(actx.getImageData(0, 0, aw, ah).data, aw, ah);
        setFound(!!q);
        setQuad(q ?? defaultQuad());
        setBmp(b);
      } catch { if (!dead) setFailed(true); }
    })();
    return () => { dead = true; };
  }, [file]);

  // The overlay owns Esc/Tab: the surrounding Modal listens on document and would close or steal focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); onCancel(); }
      else if (e.key === "Tab") {
        e.stopImmediatePropagation();
        const root = document.getElementById("scanner-root");
        const els = root ? [...root.querySelectorAll<HTMLElement>("button:not([disabled])")] : [];
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (!root?.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  // Fit the photo in the stage.
  useEffect(() => {
    if (!bmp || !stage.current) return;
    const el = stage.current;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const s = Math.min(r.width / bmp.width, r.height / bmp.height);
      setView({ w: Math.floor(bmp.width * s), h: Math.floor(bmp.height * s) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bmp]);

  useEffect(() => {
    if (!bmp || !preview.current || !view.w) return;
    const c = preview.current;
    c.width = view.w; c.height = view.h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, view.w, view.h);
  }, [bmp, view]);

  const autoDetect = useCallback(() => {
    if (!bmp) return;
    const a = Math.min(1, ANALYZE_EDGE / Math.max(bmp.width, bmp.height));
    const aw = Math.max(8, Math.round(bmp.width * a)), ah = Math.max(8, Math.round(bmp.height * a));
    const ac = canvasOf(aw, ah);
    const ctx = ac.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0, aw, ah);
    const q = detectQuad(ctx.getImageData(0, 0, aw, ah).data, aw, ah);
    setFound(!!q);
    setQuad(q ?? defaultQuad());
  }, [bmp]);

  function pointer(e: React.PointerEvent): Pt {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }
  function onDown(i: number) { return (e: React.PointerEvent) => { drag.current = i; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); e.preventDefault(); }; }
  function onMove(e: React.PointerEvent) {
    if (drag.current === null) return;
    const host = (e.currentTarget as HTMLElement).parentElement!;
    const r = host.getBoundingClientRect();
    const p = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
    const i = drag.current;
    setQuad((q) => q.map((v, k) => (k === i ? p : v)));
  }
  const onUp = () => { drag.current = null; };

  async function finish(useOriginal: boolean) {
    if (useOriginal) { onDone(null); return; }
    const src = srcPixels.current;
    if (!src) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30)); // let the spinner paint
    try {
      const px = quad.map((p) => ({ x: p.x * (src.w - 1), y: p.y * (src.h - 1) }));
      const { w, h } = outputSize(px);
      const out = warpPerspective(src.data, src.w, src.h, px, w, h);
      applyFilter(out, w, h, filter);
      const c = canvasOf(w, h);
      c.getContext("2d")!.putImageData(new ImageData(out as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
      const toBlob = (type: string, q?: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));
      let blob = filter === "color" ? await toBlob("image/jpeg", 0.85) : await toBlob("image/png");
      if (blob && blob.size > 1.5 * 1024 * 1024) blob = await toBlob("image/jpeg", 0.85) ?? blob; // keep uploads small
      if (!blob) { onDone(null); return; }
      const ext = blob.type === "image/png" ? "png" : "jpg";
      onDone(new File([blob], `receipt-scan.${ext}`, { type: blob.type }));
    } catch {
      onDone(null);
    } finally { setBusy(false); }
  }

  const poly = useMemo(() => quad.map((p) => `${p.x * 100},${p.y * 100}`).join(" "), [quad]);
  if (!mounted) return null;

  return createPortal(
    <div id="scanner-root" role="dialog" aria-modal="true" aria-label="Scan receipt" className="fixed inset-0 z-[100] flex flex-col bg-slate-950 text-white">
      <div className="flex items-center gap-2 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <ScanLine className="size-5 text-cyan-300" aria-hidden />
        <h2 className="mr-auto text-sm font-bold">Scan receipt</h2>
        <button type="button" onClick={onCancel} aria-label="Cancel scan" className="flex size-11 items-center justify-center rounded-xl hover:bg-white/10"><X className="size-5" aria-hidden /></button>
      </div>

      <div ref={stage} className="relative flex min-h-0 flex-1 items-center justify-center px-3">
        {failed ? (
          <div className="space-y-3 text-center text-sm">
            <p>This photo can&apos;t be opened for scanning.</p>
            <button type="button" className="btn" onClick={() => onDone(null)}>Use the photo as is</button>
          </div>
        ) : !bmp ? (
          <p className="text-sm text-slate-300">Opening photo…</p>
        ) : (
          <div className="relative touch-none select-none" style={{ width: view.w, height: view.h }}>
            <canvas ref={preview} className="block size-full" />
            <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <path d={`M0,0H100V100H0Z M${quad.map((p) => `${p.x * 100},${p.y * 100}`).join(" L")}Z`} fill="rgba(2,6,23,0.55)" fillRule="evenodd" />
              <polygon points={poly} fill="none" stroke="#22d3ee" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            </svg>
            {quad.map((p, i) => (
              <div
                key={i} role="slider" aria-label={`Corner ${i + 1}`} aria-valuetext={`${Math.round(p.x * 100)}%, ${Math.round(p.y * 100)}%`} tabIndex={-1}
                onPointerDown={onDown(i)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              >
                <span className="size-5 rounded-full border-2 border-white bg-cyan-400/80 shadow" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
        <p className="text-center text-xs text-slate-300" aria-live="polite">
          {!bmp ? "" : found ? "Drag the corners to match the receipt." : "Couldn’t find the edges. Drag the corners onto the receipt."}
        </p>
        <div className="flex items-center justify-center gap-1.5" role="group" aria-label="Look">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
              className={`min-h-10 rounded-full px-3.5 text-xs font-semibold ${filter === f.key ? "bg-white text-slate-900" : "bg-white/10 text-white hover:bg-white/20"}`}>{f.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-white/20" onClick={autoDetect} disabled={!bmp}><Wand2 className="size-4" aria-hidden /> Auto</button>
          <button type="button" className="min-h-11 rounded-xl px-3 text-sm font-medium text-slate-300 hover:bg-white/10" onClick={() => finish(true)} disabled={!bmp || busy}>Use original</button>
          <button type="button" className="ml-auto flex min-h-11 items-center gap-1.5 rounded-xl bg-cyan-400 px-5 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-60" onClick={() => finish(false)} disabled={!bmp || busy}>
            <Check className="size-4" aria-hidden /> {busy ? "Scanning…" : "Done"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
