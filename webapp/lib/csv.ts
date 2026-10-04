import { parseToCents } from "@/lib/utils/currency";

/** Minimal RFC-4180 CSV parser: quoted fields, escaped quotes, CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Pre-configured layouts for standard bank / budgeting-app exports. */
export type CsvTemplateId = "auto" | "single-amount" | "outflow-inflow";

export const CSV_TEMPLATES: { id: CsvTemplateId; label: string; hint: string }[] = [
  { id: "auto", label: "Auto-detect from header row", hint: "Looks for Date, Payee/Description, Memo, Amount or Outflow/Inflow columns." },
  { id: "single-amount", label: "Date, Payee, Memo, Amount", hint: "One signed Amount column (negative = money out). Most bank exports." },
  { id: "outflow-inflow", label: "Date, Payee, Memo, Outflow, Inflow", hint: "Separate Outflow and Inflow columns (YNAB-style)." },
];

export interface ParsedRow {
  line: number;
  date: string; // YYYY-MM-DD
  payee: string;
  memo: string;
  amountCents: number; // signed: negative = outflow
}
export interface RowError { line: number; message: string; raw: string }
export interface ParseResult { rows: ParsedRow[]; errors: RowError[]; headerFound: boolean }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const DATE_KEYS = ["date", "transactiondate", "postdate", "posteddate", "postingdate"];
const PAYEE_KEYS = ["payee", "description", "name", "merchant", "details"];
const MEMO_KEYS = ["memo", "note", "notes", "reference"];
const AMOUNT_KEYS = ["amount", "amt"];
const OUT_KEYS = ["outflow", "debit", "withdrawal", "withdrawals"];
const IN_KEYS = ["inflow", "credit", "deposit", "deposits"];

function findCol(header: string[], keys: string[]): number {
  return header.findIndex((h) => keys.includes(norm(h)));
}

export function parseDate(input: string): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s))) {
    m = +match[1]; d = +match[2]; y = +match[3];
    if (match[3].length === 2) y += 2000;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // e.g. Feb 30
  return dt.toISOString().slice(0, 10);
}

export function parseBankCsv(text: string, template: CsvTemplateId = "auto"): ParseResult {
  const table = parseCsv(text);
  const result: ParseResult = { rows: [], errors: [], headerFound: false };
  if (table.length === 0) return result;

  const first = table[0];
  const looksLikeHeader = findCol(first, DATE_KEYS) >= 0 && (findCol(first, AMOUNT_KEYS) >= 0 || findCol(first, OUT_KEYS) >= 0 || findCol(first, IN_KEYS) >= 0);
  result.headerFound = looksLikeHeader;

  let cols: { date: number; payee: number; memo: number; amount: number; out: number; inn: number };
  if (looksLikeHeader) {
    cols = {
      date: findCol(first, DATE_KEYS), payee: findCol(first, PAYEE_KEYS), memo: findCol(first, MEMO_KEYS),
      amount: findCol(first, AMOUNT_KEYS), out: findCol(first, OUT_KEYS), inn: findCol(first, IN_KEYS),
    };
  } else if (template === "outflow-inflow") {
    cols = { date: 0, payee: 1, memo: 2, amount: -1, out: 3, inn: 4 };
  } else if (template === "single-amount") {
    cols = { date: 0, payee: 1, memo: 2, amount: 3, out: -1, inn: -1 };
  } else {
    result.errors.push({ line: 1, message: "No header row found. Pick a column layout (Date, Payee, Memo, Amount) or add a header row.", raw: first.join(",") });
    return result;
  }
  // A forced template only overrides when the user explicitly chose one AND the header is missing.
  const useSplit = cols.amount < 0 && (cols.out >= 0 || cols.inn >= 0);

  const start = looksLikeHeader ? 1 : 0;
  for (let i = start; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const raw = r.join(",");
    const date = parseDate(r[cols.date] ?? "");
    if (!date) { result.errors.push({ line, message: `Unreadable date "${(r[cols.date] ?? "").trim()}"`, raw }); continue; }

    let amountCents: number | null;
    if (useSplit) {
      const outRaw = (cols.out >= 0 ? r[cols.out] ?? "" : "").trim();
      const inRaw = (cols.inn >= 0 ? r[cols.inn] ?? "" : "").trim();
      const out = outRaw === "" ? 0 : parseToCents(outRaw);
      const inn = inRaw === "" ? 0 : parseToCents(inRaw);
      amountCents = out === null || inn === null || (outRaw === "" && inRaw === "") ? null : Math.abs(inn) - Math.abs(out);
    } else {
      amountCents = parseToCents(r[cols.amount] ?? "");
    }
    if (amountCents === null) { result.errors.push({ line, message: "Unreadable amount", raw }); continue; }

    result.rows.push({
      line,
      date,
      payee: (r[cols.payee] ?? "").trim().slice(0, 200),
      memo: (r[cols.memo] ?? "").trim().slice(0, 500),
      amountCents,
    });
  }
  return result;
}
