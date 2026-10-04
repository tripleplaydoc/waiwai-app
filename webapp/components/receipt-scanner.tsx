"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Eye, Pencil, RotateCcw, RotateCw, ScanLine, Wand2, X } from "lucide-react";
import { applyFilter, defaultQuad, detectQuad, isConvex, outputSize, warpPerspective, type Pt, type ScanFilter } from "@/lib/scan/geometry";

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
  const [active, setActive] = useState<number | null>(null); // corner being dragged (for the magnifier)
  const [preview_, setPreview] = useState<string | null>(null); // object URL of the cleaned-up result
  const [error, setError] = useState<string>();
  const loupe = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const srcPixels = useRef<{ data: Uint8ClampedArray; w: number; h: number } | null>(null);
  const drag = useRef<number | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });

  useEffect(() => setMounted(true), []);

  // Takes a bitmap, keeps its pixels for the final warp, and looks for the receipt's edges.
  const ingest = useCallback((b: ImageBitmap) => {
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
    setError(undefined);
    setPreview((u) => { if (u) URL.revokeObjectURL(u); return null; });
    setBmp(b);
  }, []);

  // Load the photo, respecting EXIF rotation, capped so big phone shots stay fast.
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        let b = await createImageBitmap(file, { imageOrientation: "from-image" });
        const s = Math.min(1, SOURCE_EDGE / Math.max(b.width, b.height));
        if (s < 1) b = await createImageBitmap(b, { resizeWidth: Math.round(b.width * s), resizeHeight: Math.round(b.height * s), resizeQuality: "high" });
        if (dead) return;
        ingest(b);
      } catch { if (!dead) setFailed(true); }
    })();
    return () => { dead = true; };
  }, [file, ingest]);

  // Turn the photo a quarter turn (receipts are often shot sideways) and look for the edges again.
  async function rotate(dir: 1 | -1) {
    if (!bmp) return;
    const c = canvasOf(bmp.height, bmp.width);
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((dir * Math.PI) / 2);
    ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
    ingest(await createImageBitmap(c));
  }

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
  function onDown(i: number) { return (e: React.PointerEvent) => { drag.current = i; setActive(i); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); e.preventDefault(); }; }
  function onMove(e: React.PointerEvent) {
    if (drag.current === null) return;
    const host = (e.currentTarget as HTMLElement).parentElement!;
    const r = host.getBoundingClientRect();
    const p = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
    const i = drag.current;
    // Never let the outline fold over itself or collapse; that can't be straightened.
    setQuad((q) => {
      const next = q.map((v, k) => (k === i ? p : v));
      const tooClose = next.some((a, ia) => next.some((b, ib) => ia < ib && Math.hypot(a.x - b.x, a.y - b.y) < 0.06));
      return tooClose || !isConvex(next) ? q : next;
    });
  }
  const onUp = () => { drag.current = null; setActive(null); };

  // Magnifier: your finger covers the corner you're moving, so show it enlarged elsewhere.
  useEffect(() => {
    const c = loupe.current;
    if (active === null || !c || !bmp) return;
    const size = c.width;
    const p = quad[active];
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#020617"; ctx.fillRect(0, 0, size, size);
    const base = Math.max(bmp.width, bmp.height) / 12; // the area around the corner, scaled to the photo
    const sw = base * 2, sh = base * 2;
    ctx.drawImage(bmp, p.x * bmp.width - sw / 2, p.y * bmp.height - sh / 2, sw, sh, 0, 0, size, size);
    ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(size / 2, size / 2 - 10); ctx.lineTo(size / 2, size / 2 + 10); ctx.moveTo(size / 2 - 10, size / 2); ctx.lineTo(size / 2 + 10, size / 2); ctx.stroke();
  }, [active, quad, bmp]);

  /** Straightens and cleans the photo into a canvas, long edge at most maxEdge. */
  function build(maxEdge: number): HTMLCanvasElement | null {
    const src = srcPixels.current;
    if (!src) return null;
    const px = quad.map((p) => ({ x: p.x * (src.w - 1), y: p.y * (src.h - 1) }));
    const { w, h } = outputSize(px, maxEdge);
    const out = warpPerspective(src.data, src.w, src.h, px, w, h);
    applyFilter(out, w, h, filter);
    const c = canvasOf(w, h);
    c.getContext("2d")!.putImageData(new ImageData(out as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
    return c;
  }

  // Show the result before saving it.
  async function togglePreview() {
    if (preview_) { URL.revokeObjectURL(preview_); setPreview(null); return; }
    setBusy(true);
    await new Promise((r) => setTimeout(r, 20));
    try {
      const c = build(1000);
      const blob = c && (await new Promise<Blob | null>((res) => c.toBlob(res, "image/png")));
      if (!blob) throw new Error("no image");
      setPreview(URL.createObjectURL(blob)); setError(undefined);
    } catch { setError("Couldn’t straighten with these corners. Move them so they outline the receipt."); }
    finally { setBusy(false); }
  }
  // A new look or new corners make an old preview wrong.
  useEffect(() => { setPreview((u) => { if (u) URL.revokeObjectURL(u); return null; }); }, [filter]);

  async function finish(useOriginal: boolean) {
    if (useOriginal) { onDone(null); return; }
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30)); // let the spinner paint
    try {
      const c = build(1800);
      if (!c) { setBusy(false); return; }
      const toBlob = (type: string, q?: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));
      let blob = filter === "color" ? await toBlob("image/jpeg", 0.85) : await toBlob("image/png");
      if (blob && blob.size > 1.5 * 1024 * 1024) blob = await toBlob("image/jpeg", 0.85) ?? blob; // keep uploads small
      if (!blob) throw new Error("no image");
      const ext = blob.type === "image/png" ? "png" : "jpg";
      onDone(new File([blob], `receipt-scan.${ext}`, { type: blob.type }));
    } catch {
      setError("Couldn’t straighten with these corners. Move them so they outline the receipt, or use the original photo.");
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
          preview_ ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview_} alt="Preview of the scanned receipt" className="max-h-full max-w-full rounded bg-white object-contain" />
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
            {active !== null && (
              <canvas ref={loupe} width={112} height={112} aria-hidden
                className={`pointer-events-none absolute top-2 size-28 rounded-full border-2 border-cyan-300 shadow-xl ${quad[active].x < 0.5 ? "right-2" : "left-2"}`} />
            )}
          </div>
          )
        )}
      </div>

      <div className="space-y-2 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
        <p className="text-center text-xs text-slate-300" aria-live="polite">
          {!bmp ? "" : preview_ ? "This is how it will be saved." : found ? "Drag the corners to match the receipt." : "Couldn’t find the edges. Drag the corners onto the receipt."}
        </p>
        {error && <p role="alert" className="text-center text-xs text-red-300">{error}</p>}
        <div className="flex items-center justify-center gap-1.5" role="group" aria-label="Look">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
              className={`min-h-10 rounded-full px-3.5 text-xs font-semibold ${filter === f.key ? "bg-white text-slate-900" : "bg-white/10 text-white hover:bg-white/20"}`}>{f.label}</button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <button type="button" aria-label="Rotate left" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20" onClick={() => rotate(-1)} disabled={!bmp || busy}><RotateCcw className="size-4" aria-hidden /></button>
          <button type="button" aria-label="Rotate right" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20" onClick={() => rotate(1)} disabled={!bmp || busy}><RotateCw className="size-4" aria-hidden /></button>
          <button type="button" className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-white/20" onClick={autoDetect} disabled={!bmp || !!preview_}><Wand2 className="size-4" aria-hidden /> Auto</button>
          <button type="button" aria-pressed={!!preview_} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-white/20" onClick={togglePreview} disabled={!bmp || busy}>{preview_ ? <><Pencil className="size-4" aria-hidden /> Edit</> : <><Eye className="size-4" aria-hidden /> Preview</>}</button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="min-h-11 rounded-xl px-3 text-sm font-medium text-slate-300 hover:bg-white/10" onClick={() => finish(true)} disabled={!bmp || busy}>Original</button>
          <button type="button" className="ml-auto flex min-h-11 items-center gap-1.5 rounded-xl bg-cyan-400 px-5 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-60" onClick={() => finish(false)} disabled={!bmp || busy}>
            <Check className="size-4" aria-hidden /> {busy ? "Scanning…" : "Done"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
