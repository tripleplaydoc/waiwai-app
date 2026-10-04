import { detectQuad, outputSize, warpPerspective, applyFilter, isConvex, type Pt } from "./geometry";

let failed = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) { failed++; console.error(`FAIL ${n} ${extra}`); } else console.log(`ok   ${n} ${extra}`); };

/** Draws a tilted receipt (white, with dark text rows) on a coloured table. Returns RGBA + the true corners. */
function scene(w: number, h: number, table: [number, number, number], paper: [number, number, number], angleDeg: number, cx = 0.5, cy = 0.5, rw = 0.45, rh = 0.8, shadow = false) {
  const px = new Uint8ClampedArray(w * h * 4);
  const a = (angleDeg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const hw = (rw * w) / 2, hh = (rh * h) / 2, ox = cx * w, oy = cy * h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - ox, dy = y - oy;
    const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
    const inside = Math.abs(u) < hw && Math.abs(v) < hh;
    let c: [number, number, number] = table;
    if (shadow) { const k = 0.8 + 0.2 * (x / w); c = [table[0] * k, table[1] * k, table[2] * k]; }
    if (inside) {
      c = paper;
      const row = Math.floor((v + hh) / 6);
      if (row % 2 === 0 && Math.abs(u) < hw * 0.8 && ((Math.floor((u + hw) / 4) + row) % 3 !== 0)) c = [40, 40, 40]; // "text"
    }
    const o = (y * w + x) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
  }
  const corner = (su: number, sv: number): Pt => ({ x: (ox + su * hw * cos - sv * hh * sin) / (w - 1), y: (oy + su * hw * sin + sv * hh * cos) / (h - 1) });
  return { px, truth: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)] };
}
const err = (q: Pt[], t: Pt[]) => Math.max(...q.map((p, i) => Math.hypot(p.x - t[i].x, p.y - t[i].y)));

const W = 300, H = 400;
const cases: [string, ReturnType<typeof scene>][] = [
  ["white receipt on dark table", scene(W, H, [50, 40, 35], [245, 245, 240], 8)],
  ["white receipt on wood", scene(W, H, [150, 105, 60], [240, 240, 235], -12)],
  ["white receipt on LIGHT gray table", scene(W, H, [185, 185, 180], [248, 248, 245], 6)],
  ["white receipt on light table with shading", scene(W, H, [190, 188, 180], [250, 250, 247], -5, 0.5, 0.5, 0.45, 0.8, true)],
  ["off-centre long thin receipt", scene(W, H, [60, 70, 90], [235, 235, 230], 4, 0.4, 0.55, 0.3, 0.85)],
];
for (const [name, s] of cases) {
  const q = detectQuad(s.px, W, H);
  if (!q) { ok(name, false, "(not found)"); continue; }
  const e = err(q, s.truth);
  ok(name, e < 0.07, `max corner error ${(e * 100).toFixed(1)}% of frame`);
}

// An empty frame must not be reported as a receipt
const flat = new Uint8ClampedArray(W * H * 4).fill(180);
ok("blank frame -> null", detectQuad(flat, W, H) === null);

// warp straightens: a rectangle receipt warped to its aspect ratio is mostly paper-coloured
{
  const s = scene(W, H, [50, 40, 35], [245, 245, 240], 8);
  const q = detectQuad(s.px, W, H)!;
  const px = q.map((p) => ({ x: p.x * (W - 1), y: p.y * (H - 1) }));
  const { w, h } = outputSize(px);
  const out = warpPerspective(s.px, W, H, px, w, h);
  let dark = 0; for (let i = 0; i < out.length; i += 4) if (out[i] < 90 && out[i + 1] < 90) dark++;
  ok("warp output has little table showing", dark / (w * h) < 0.45, `dark share ${(100 * dark / (w * h)).toFixed(0)}%`);
  applyFilter(out, w, h, "bw");
  let white = 0; for (let i = 0; i < out.length; i += 4) if (out[i] === 255) white++;
  ok("b&w filter makes mostly white paper", white / (w * h) > 0.5);
  ok("detected quad is convex", isConvex(q));
}
if (failed) { console.error(`${failed} failed`); process.exit(1); } else console.log("all passed");
