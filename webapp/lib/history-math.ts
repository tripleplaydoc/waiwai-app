import { OWNER_DRAW, TYPE_DEFS, deductibleShareBps } from "@/lib/budget/expense-types";
import { matchRule } from "@/lib/budget/suggest";
import { formatCents } from "@/lib/utils/currency";

/**
 * Pure helpers for the History layer (past years kept apart from the live budget).
 * Money is integer cents.
 */
export type HistKind = "INCOME" | "EXPENSE" | "TRANSFER";

const DEF = new Map(TYPE_DEFS.map((t) => [t.key, t]));
export const TRANSFER_RE = /\b(transfer|xfer)\b/i;

/** The kind a transaction counts as once it has a type. Null type: decided by the sign of the amount. */
export function kindFor(typeKey: string | null, amountCents: number): HistKind {
  const def = typeKey ? DEF.get(typeKey) : undefined;
  if (def) return def.kind === "INCOME" ? "INCOME" : "EXPENSE";
  return amountCents >= 0 ? "INCOME" : "EXPENSE";
}

/** Business expenses of a business workspace are deductible unless they are the owner's personal share. */
export function isDeductibleType(typeKey: string | null, isBusiness: boolean): boolean {
  if (!isBusiness || !typeKey || typeKey === OWNER_DRAW) return false;
  const d = DEF.get(typeKey);
  return !!d && d.kind === "EXPENSE" && d.group === "Business";
}

/** Guess kind, type and deductibility for a statement row from its wording. */
export function classifyHistoryRow(o: { payee: string; memo: string; amountCents: number; isBusiness: boolean }): { kind: HistKind; typeKey: string | null; isTaxDeductible: boolean } {
  const text = `${o.payee} ${o.memo}`;
  if (TRANSFER_RE.test(text)) return { kind: "TRANSFER", typeKey: null, isTaxDeductible: false };
  let typeKey: string | null = null;
  if (o.amountCents < 0) {
    const hit = matchRule(text) ?? matchRule(text.replace(/[._*#/\-]+/g, " ")); // bank wording like ZOOM.US or SQ *CAFE
    const def = hit ? DEF.get(hit.type) : undefined;
    // A business workspace only takes business types, a personal one only personal types.
    if (def && def.kind === "EXPENSE" && (def.group === "Business") === o.isBusiness) typeKey = def.key;
  }
  return { kind: kindFor(typeKey, o.amountCents), typeKey, isTaxDeductible: isDeductibleType(typeKey, o.isBusiness) };
}

/** Amount that counts as a deduction: meals at 50%. */
export const deductibleAmount = (cents: number, typeKey: string | null) => Math.round((cents * deductibleShareBps(typeKey)) / 10000);

export interface BridgeInput {
  /** What the account held when its history begins (null = not entered yet). */
  startBalanceCents: number | null;
  /** Sum of every stored history row for the account (transfers included, they move the balance). */
  historyNetCents: number;
  /** The account's opening balance in the live budget. */
  openingCents: number;
  rowAmounts: number[];
}
export interface BridgeResult {
  state: "no-start" | "no-history" | "ok" | "off";
  /** Balance the history says the account had when the live budget began. */
  impliedCents: number | null;
  /** opening - implied. Positive = the history is short that much money. */
  gapCents: number;
  hints: string[];
}

/** Does the history flow into the opening balance? If not, says by how much and what the usual causes look like. */
export function bridge(b: BridgeInput): BridgeResult {
  if (b.rowAmounts.length === 0) return { state: "no-history", impliedCents: null, gapCents: 0, hints: [] };
  if (b.startBalanceCents === null) return { state: "no-start", impliedCents: null, gapCents: 0, hints: [] };
  const implied = b.startBalanceCents + b.historyNetCents;
  const gap = b.openingCents - implied;
  if (gap === 0) return { state: "ok", impliedCents: implied, gapCents: 0, hints: [] };
  const abs = Math.abs(gap);
  const hints: string[] = [];
  const match = (n: number) => b.rowAmounts.filter((a) => a === n).length;
  if (gap > 0) {
    hints.push(`Money is missing from the history: a ${formatCents(abs)} deposit may be missing from the import.`);
    if (match(-abs) > 0) hints.push(`A ${formatCents(abs)} withdrawal appears in the history; check it was not entered twice.`);
  } else {
    hints.push(`The history has ${formatCents(abs)} too much: a ${formatCents(abs)} deposit may be doubled or a withdrawal missing.`);
    if (match(abs) > 0) hints.push(`A ${formatCents(abs)} deposit appears in the history; check it was not entered twice.`);
    if (match(-abs) === 0 && b.rowAmounts.some((a) => a < 0)) hints.push(`A withdrawal of ${formatCents(abs)} may be missing from the import.`);
  }
  if (b.rowAmounts.some((a) => Math.abs(a) * 2 === abs)) hints.push(`Exactly double a ${formatCents(abs / 2)} entry: a sign may be flipped on it.`);
  if (abs >= 900 && abs % 900 === 0) hints.push("The gap divides evenly by 9, which often means two digits were swapped when typing a start balance or amount.");
  if (abs >= 900 && abs <= 9_000_000 && b.startBalanceCents !== null) hints.push("Also double-check the start balance you entered: it is the first thing to be off by a little.");
  return { state: "off", impliedCents: implied, gapCents: gap, hints: hints.slice(0, 4) };
}

export interface YearTypeRow { key: string; label: string; cents: number }
export interface YearSummary {
  year: number;
  revenueCents: number;
  expenseCents: number;
  netCents: number;
  deductibleCents: number;
  revenue: YearTypeRow[];
  expenses: YearTypeRow[];
  /** Counted rows that still have no type. */
  unclassifiedCount: number;
  unclassifiedCents: number;
  historyRows: number;
  /** Does this year include live budget data too? */
  includesLive: boolean;
  /** Includes totals typed in from a tax return. */
  hasTotals: boolean;
  sealed: boolean;
}
