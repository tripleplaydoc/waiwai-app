/** CSV helpers. Text cells beginning with = + - @ are neutralised so spreadsheets never run them as formulas. */
export function text(v: string | null | undefined): string {
  let s = (v ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@\t]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
export const row = (cells: (string | number)[]) => cells.join(",");
export const csvResponse = (lines: string[], filename: string) =>
  new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.\-]+/g, "_")}"`, "Cache-Control": "no-store" },
  });
/** 2026-10-03 -> 10/03/2026 (what QuickBooks Online's bank-upload wants). */
export const usDate = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
