/**
 * Pure image-processing helpers for the receipt scanner (no DOM). Everything works
 * on typed arrays so it can be unit-tested in Node.
 */
export interface Pt { x: number; y: number }

export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 151 + rgba[j + 2] * 28) >> 8;
  return g;
}

/** Integral image (sum table) with a 1px zero border: size (w+1)*(h+1). */
function integral(g: Uint8Array, w: number, h: number): Float64Array {
  const W = w + 1;
  const I = new Float64Array(W * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += g[(y - 1) * w + (x - 1)];
      I[y * W + x] = I[(y - 1) * W + x] + row;
    }
  }
  return I;
}

/** Mean of the (2r+1)^2 window around every pixel (clamped at the edges). */
export function localMean(g: Uint8Array, w: number, h: number, r: number): Float32Array {
  const I = integral(g, w, h);
  const W = w + 1;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
      out[y * w + x] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

export function otsu(g: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const total = g.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = -1, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

/** Largest 4-connected component of a binary mask (iterative flood fill). */
function largestComponent(mask: Uint8Array, w: number, h: number): number[] {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let best: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    let sp = 0; stack[sp++] = s; seen[s] = 1;
    const comp: number[] = [];
    while (sp > 0) {
      const p = stack[--sp];
      comp.push(p);
      const x = p % w, y = (p - x) / w;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
    }
    if (comp.length > best.length) best = comp;
  }
  return best;
}

/** Extreme corners (TL, TR, BR, BL) of a pixel set, normalised to 0..1. */
function cornersOf(best: number[], w: number, h: number): Pt[] {
  let tl = Infinity, br = -Infinity, tr = -Infinity, bl = Infinity;
  let pTL: Pt = { x: 0, y: 0 }, pBR: Pt = { x: w - 1, y: h - 1 }, pTR: Pt = { x: w - 1, y: 0 }, pBL: Pt = { x: 0, y: h - 1 };
  for (const p of best) {
    const x = p % w, y = (p - x) / w;
    const a = x + y, d = x - y;
    if (a < tl) { tl = a; pTL = { x, y }; }
    if (a > br) { br = a; pBR = { x, y }; }
    if (d > tr) { tr = d; pTR = { x, y }; }
    if (d < bl) { bl = d; pBL = { x, y }; }
  }
  return [pTL, pTR, pBR, pBL].map((p) => ({ x: p.x / (w - 1), y: p.y / (h - 1) }));
}

/** Fills holes inside a mask (text on a receipt is darker than the paper and would otherwise punch holes in it). */
function closeMask(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = mask[i] ? 255 : 0;
  const m = localMean(g, w, h, r);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = m[i] > 110 ? 1 : 0; // majority vote in the window
  return out;
}

const plausible = (q: Pt[]) => { const a = polygonArea(q); return a >= 0.1 && a <= 0.97 && isConvex(q); };

/** Method 1: the receipt is the largest bright blob (white paper on a darker surface). */
function detectBright(raw: Uint8Array, w: number, h: number): Pt[] | null {
  const g = new Uint8Array(w * h);
  const m = localMean(raw, w, h, 2);
  for (let i = 0; i < g.length; i++) g[i] = m[i];
  const t = otsu(g);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = g[i] > t ? 1 : 0;
  const best = largestComponent(closeMask(mask, w, h, Math.max(2, Math.round(Math.min(w, h) / 60))), w, h);
  if (best.length < w * h * 0.08) return null;
  const q = cornersOf(best, w, h);
  return plausible(q) ? q : null;
}

/** Method 2: the receipt is whatever differs from the table, judged against the colour along the photo's border. */
function detectByBorder(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Pt[] | null {
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= band && x < w - band && y >= band && y < h - band) { x = w - band - 1; continue; }
    const o = (y * w + x) * 4; rs.push(rgba[o]); gs.push(rgba[o + 1]); bs.push(rgba[o + 2]);
  }
  const med = (a: number[]) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  const R = med(rs), G = med(gs), B = med(bs);
  const dist = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < dist.length; i++, j += 4) dist[i] = Math.min(255, Math.hypot(rgba[j] - R, rgba[j + 1] - G, rgba[j + 2] - B));
  const sm = localMean(dist, w, h, 2);
  const d8 = new Uint8Array(w * h);
  for (let i = 0; i < d8.length; i++) d8[i] = sm[i];
  const t = Math.max(18, otsu(d8));
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = d8[i] > t ? 1 : 0;
  const best = largestComponent(closeMask(mask, w, h, Math.max(2, Math.round(Math.min(w, h) / 60))), w, h);
  if (best.length < w * h * 0.08) return null;
  const q = cornersOf(best, w, h);
  return plausible(q) ? q : null;
}

/**
 * Finds the receipt/paper. Returns 4 corners (TL, TR, BR, BL) in 0..1 coordinates of the
 * analysed image, or null when nothing convincing is found. Tries "bright paper on a darker
 * surface" first, then "different from the table" for light tables.
 */
export function detectQuad(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Pt[] | null {
  const raw = toGray(rgba, w, h);
  return detectBright(raw, w, h) ?? detectByBorder(rgba, w, h);
}

export function defaultQuad(): Pt[] {
  return [{ x: 0.06, y: 0.06 }, { x: 0.94, y: 0.06 }, { x: 0.94, y: 0.94 }, { x: 0.06, y: 0.94 }];
}

export function polygonArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; }
  return Math.abs(a) / 2;
}

export function isConvex(p: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], c = p[(i + 2) % p.length];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cr === 0) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return sign !== 0;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Output size that preserves the quad's aspect ratio, long edge capped at maxEdge. */
export function outputSize(q: Pt[], maxEdge = 1800): { w: number; h: number } {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const s = Math.min(1, maxEdge / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Homography H (row-major 3x3, h33 = 1) mapping src[i] -> dst[i], via 8x8 Gaussian elimination. */
export function solveHomography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) throw new Error("degenerate quad");
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return [...h, 1];
}

export function applyH(H: number[], p: Pt): Pt {
  const d = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / d, y: (H[3] * p.x + H[4] * p.y + H[5]) / d };
}

/** Straightens the quad (pixel coordinates in the source) into an outW x outH RGBA image. */
export function warpPerspective(src: Uint8ClampedArray | Uint8Array, sw: number, sh: number, quad: Pt[], outW: number, outH: number): Uint8ClampedArray {
  const rect: Pt[] = [{ x: 0, y: 0 }, { x: outW - 1, y: 0 }, { x: outW - 1, y: outH - 1 }, { x: 0, y: outH - 1 }];
  const H = solveHomography(rect, quad); // output pixel -> source pixel
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const d = H[6] * x + H[7] * y + H[8];
      let sx = (H[0] * x + H[1] * y + H[2]) / d, sy = (H[3] * x + H[4] * y + H[5]) / d;
      sx = Math.min(sw - 1, Math.max(0, sx)); sy = Math.min(sh - 1, Math.max(0, sy));
      const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const o = (y * outW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * sw + x0) * 4 + c], b = src[(y0 * sw + x1) * 4 + c];
        const cc = src[(y1 * sw + x0) * 4 + c], dd = src[(y1 * sw + x1) * 4 + c];
        out[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + dd * fx) * fy;
      }
    }
  }
  return out;
}

export type ScanFilter = "bw" | "gray" | "color";

/** Applies the chosen look in place on an RGBA buffer. */
export function applyFilter(rgba: Uint8ClampedArray, w: number, h: number, filter: ScanFilter): void {
  if (filter === "color") return;
  const g = toGray(rgba, w, h);
  const r = Math.max(8, Math.round(Math.min(w, h) / 16));
  const mean = localMean(g, w, h, r);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    let v: number;
    if (filter === "bw") {
      // Dark ink on uneven light: black if clearly below the local average.
      v = g[i] < mean[i] * 0.9 ? 0 : 255;
    } else {
      // Flatten lighting by dividing out the local background, then boost contrast.
      const n = Math.min(1, g[i] / Math.max(1, mean[i] * 1.05));
      v = Math.round(255 * Math.pow(n, 2.2));
    }
    rgba[j] = rgba[j + 1] = rgba[j + 2] = v;
    rgba[j + 3] = 255;
  }
}
