import type { ParseResult, ParsedRow } from "@/lib/csv";

/** Bank downloads in OFX / QFX / QBO format (QuickBooks "Web Connect" files are OFX). SGML (no closing tags) and XML both work. */
export function looksLikeOfx(text: string): boolean {
  const head = text.slice(0, 2000).toUpperCase();
  return head.includes("OFXHEADER") || head.includes("<OFX>") || /<STMTTRN>/i.test(text.slice(0, 200000));
}

export interface OfxResult extends ParseResult {
  /** The balance the bank states at the end of the statement, when the file has one. */
  ledger: { cents: number; date: string | null } | null;
  /** Last digits of the account number in the file, to help pick the right account. */
  acctTail: string | null;
  kind: "bank" | "card" | null;
}

const decode = (s: string) => s.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'").replace(/\s+/g, " ").trim();
const field = (chunk: string, tag: string): string | null => {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(chunk);
  return m ? m[1].trim() : null;
};
/** "20261001120000[-10:HST]" -> "2026-10-01" */
export function ofxDate(v: string | null): string | null {
  const m = v ? /^(\d{4})(\d{2})(\d{2})/.exec(v) : null;
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
/** "-84.17" -> -8417 (no floating point). */
export function ofxCents(v: string | null): number | null {
  if (!v) return null;
  let s = v.replace(/[$\s]/g, "");
  if (!s.includes(".") && /,\d{1,2}$/.test(s)) s = s.replace(",", "."); else s = s.replace(/,/g, "");
  const m = /^([+-])?(\d*)(?:\.(\d{0,}))?$/.exec(s);
  if (!m || (m[2] === "" && !m[3])) return null;
  const frac = ((m[3] ?? "") + "00").slice(0, 2);
  const roundUp = (m[3] ?? "").length > 2 && +(m[3] ?? "")[2] >= 5 ? 1 : 0;
  const n = +(m[2] || "0") * 100 + +frac + roundUp;
  return m[1] === "-" ? -n : n;
}

export function parseOfx(text: string): OfxResult {
  const rows: ParsedRow[] = [];
  const errors: ParseResult["errors"] = [];
  const chunks = text.split(/<STMTTRN>/i).slice(1);
  chunks.forEach((raw, i) => {
    const chunk = raw.split(/<\/STMTTRN>/i)[0];
    const date = ofxDate(field(chunk, "DTPOSTED"));
    const cents = ofxCents(field(chunk, "TRNAMT"));
    const name = decode(field(chunk, "NAME") ?? "");
    const memo = decode(field(chunk, "MEMO") ?? "");
    if (!date) { errors.push({ line: i + 1, message: "No valid posted date.", raw: chunk.slice(0, 80) }); return; }
    if (cents === null) { errors.push({ line: i + 1, message: "No valid amount.", raw: chunk.slice(0, 80) }); return; }
    const payee = (name || memo).slice(0, 200);
    rows.push({ line: i + 1, date, payee, memo: name && memo && memo !== name ? memo.slice(0, 500) : "", amountCents: cents });
  });
  const lb = /<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|$)/i.exec(text);
  const balCents = lb ? ofxCents(field(lb[1], "BALAMT")) : null;
  const acct = field(text, "ACCTID");
  return {
    rows, errors, headerFound: true,
    ledger: lb && balCents !== null ? { cents: balCents, date: ofxDate(field(lb[1], "DTASOF")) } : null,
    acctTail: acct ? acct.replace(/\W/g, "").slice(-4) : null,
    kind: /<CCSTMTRS>/i.test(text) ? "card" : /<STMTRS>/i.test(text) ? "bank" : null,
  };
}
