import { formatCents } from "@/lib/utils/currency";

/**
 * The Money moves log. Every move of money (between pockets, back to the pool, between bank accounts, Rebalance,
 * Held in changes, and one-off fixes) is already written down as rows in the budget ledger. One move is the set of
 * rows saved in one go (they share the same created-at moment). This file reads those rows back as a list of moves
 * and works out the rows that undo one. Pure integer-cents math, no database.
 *
 * Undoing never erases anything: it adds offsetting rows whose note starts "Undo of <key>", so the log keeps both.
 */

export interface MoveRow {
  id: string;
  categoryId: string;
  categoryName: string;
  fundingAccountId: string | null;
  month: string; // YYYY-MM-DD
  amountCents: number;
  source: string;
  note: string | null;
  createdAtMs: number;
}

/** A transfer between two of the person's own bank accounts (credit cards are left out). */
export interface MoveTransfer {
  groupId: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  cents: number;
  date: string;
  createdAtMs: number;
}

export type MoveKind = "pocket" | "pool" | "transfer" | "rebalance" | "heldin" | "fix" | "undo";

export interface MoveEntry {
  /** Ledger moment in ms (as text), or "t:<transfer group>" for a transfer that moved no pocket labels. */
  key: string;
  kind: MoveKind;
  title: string;
  /** Short lines: which pockets, which accounts. */
  lines: string[];
  cents: number;
  atMs: number;
  undone: boolean;
  canUndo: boolean;
  transferGroupId: string | null;
  /** For an undo entry: the key of the move it undid. */
  undoOf?: string;
}

const UNDO_RE = /^Undo of (\d+|t:[\w-]+)/;

/** The note that goes on every undo row, so the log can tell which move was undone. */
export const undoNote = (key: string, original: string | null) => `Undo of ${key}${original ? `: ${original}` : ""}`;

export function undoTargetOf(note: string | null): string | null {
  const m = note ? UNDO_RE.exec(note) : null;
  return m ? m[1] : null;
}

function classify(row: MoveRow): { kind: MoveKind; toName?: string } | null {
  const note = row.note ?? "";
  if (/^Undo\b/.test(note)) return { kind: "undo" };
  if (row.source === "MANUAL" && /^Moved (to|from) /.test(note)) return { kind: "pocket" };
  if (row.source === "MANUAL" && /^Moved back to the pool/.test(note)) return { kind: "pool" };
  const t = /^(?:Directed|Moved) with transfer to (.+)$/.exec(note);
  if (row.source === "CORRECTION" && t) return { kind: "transfer", toName: t[1] };
  if (row.source === "CORRECTION" && /^Rebalanced:/.test(note)) return { kind: "rebalance" };
  if (row.source === "CORRECTION" && /^Held in set:/.test(note)) return { kind: "heldin" };
  if (row.source === "CORRECTION" && /^(Held in fix|Balance fix|Fix)\b/i.test(note)) return { kind: "fix" };
  return null;
}

interface Pair { categoryName: string; from: string | null; to: string | null; cents: number }

/** Matches each pocket's minus rows with its plus rows of the same size: "this much left account A for account B". */
function pairs(rows: MoveRow[]): Pair[] {
  const out: Pair[] = [];
  const byCat = new Map<string, MoveRow[]>();
  for (const r of rows) byCat.set(r.categoryId, [...(byCat.get(r.categoryId) ?? []), r]);
  for (const list of byCat.values()) {
    const minus = list.filter((r) => r.amountCents < 0);
    const plus = list.filter((r) => r.amountCents > 0);
    for (const m of minus) {
      const i = plus.findIndex((p) => p.amountCents === -m.amountCents);
      if (i < 0) continue;
      const p = plus.splice(i, 1)[0];
      const same = out.find((x) => x.categoryName === m.categoryName && x.from === m.fundingAccountId && x.to === p.fundingAccountId);
      if (same) same.cents += p.amountCents; else out.push({ categoryName: m.categoryName, from: m.fundingAccountId, to: p.fundingAccountId, cents: p.amountCents });
    }
  }
  return out;
}

const sum = (rows: MoveRow[], pick: (n: number) => boolean) => rows.reduce((s, r) => s + (pick(r.amountCents) ? Math.abs(r.amountCents) : 0), 0);
const listNames = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`);

/** Turns ledger rows (and the person's transfers) into the log, newest first. */
export function buildMoves(rows: readonly MoveRow[], transfers: readonly MoveTransfer[], accountNames: ReadonlyMap<string, string>): MoveEntry[] {
  const acct = (k: string | null) => (k ? accountNames.get(k) ?? "an account" : "no account");
  const groups = new Map<number, MoveRow[]>();
  for (const r of rows) groups.set(r.createdAtMs, [...(groups.get(r.createdAtMs) ?? []), r]);

  const undone = new Set<string>();
  for (const r of rows) { const t = undoTargetOf(r.note); if (t) undone.add(t); }

  const out: MoveEntry[] = [];
  const usedTransfers = new Set<string>();
  for (const [ms, list] of groups) {
    const hit = list.map(classify).find((c) => c !== null) ?? null;
    if (!hit) continue;
    const key = String(ms);
    const base = { key, atMs: ms, undone: undone.has(key), transferGroupId: null as string | null };
    if (hit.kind === "undo") {
      out.push({ ...base, kind: "undo", title: "Undid an earlier move", lines: [], cents: sum(list, (n) => n > 0), undone: false, canUndo: false, undoOf: list.map((r) => undoTargetOf(r.note)).find((x) => x) ?? undefined });
      continue;
    }
    if (hit.kind === "pocket") {
      const from = [...new Set(list.filter((r) => r.amountCents < 0).map((r) => r.categoryName))];
      const to = [...new Set(list.filter((r) => r.amountCents > 0).map((r) => r.categoryName))];
      const held = [...new Set(list.map((r) => acct(r.fundingAccountId)))];
      const cents = sum(list, (n) => n > 0);
      out.push({ ...base, kind: "pocket", title: `Moved ${formatCents(cents)} from ${listNames(from)} to ${listNames(to)}`, lines: [`Held in ${held.join(" and ")}`], cents, canUndo: !base.undone });
    } else if (hit.kind === "pool") {
      const from = [...new Set(list.map((r) => r.categoryName))];
      const cents = sum(list, (n) => n < 0);
      out.push({ ...base, kind: "pool", title: `Moved ${formatCents(cents)} from ${listNames(from)} back to the pool`, lines: [`From ${[...new Set(list.map((r) => acct(r.fundingAccountId)))].join(" and ")}`], cents, canUndo: !base.undone });
    } else if (hit.kind === "transfer") {
      const toName = hit.toName ?? "";
      const t = transfers.find((x) => !usedTransfers.has(x.groupId) && x.toName === toName && Math.abs(x.createdAtMs - ms) <= 15_000);
      if (t) usedTransfers.add(t.groupId);
      const lines = pairs(list).map((p) => `${p.categoryName}: ${formatCents(p.cents)} now held in ${acct(p.to)}`);
      out.push({
        ...base, kind: "transfer", transferGroupId: t?.groupId ?? null, cents: t?.cents ?? sum(list, (n) => n > 0),
        title: t ? `Transferred ${formatCents(t.cents)} from ${t.fromName} to ${t.toName}` : `Transfer to ${toName}: pocket labels moved with it`,
        lines: [...(t ? [`Dated ${t.date}`] : []), ...lines], canUndo: !base.undone,
      });
    } else {
      const ps = pairs(list);
      const lines = ps.map((p) => `${p.categoryName}: ${formatCents(p.cents)} from ${acct(p.from)} to ${acct(p.to)}`);
      const cents = ps.reduce((s, p) => s + p.cents, 0);
      const first = list.find((r) => r.note)?.note ?? "";
      const title = hit.kind === "rebalance" ? "Rebalanced where pocket cash is held" : hit.kind === "heldin" ? "Changed where pocket cash is held" : first.replace(/^(Held in fix|Balance fix|Fix)\s*:?\s*/i, "").trim() || "Fixed balances";
      out.push({ ...base, kind: hit.kind, title: hit.kind === "fix" ? `Fix: ${title}` : title, lines: lines.length > 0 ? lines : [`${list.length} adjustments`], cents, canUndo: !base.undone });
    }
  }
  for (const t of transfers) {
    if (usedTransfers.has(t.groupId)) continue;
    out.push({ key: `t:${t.groupId}`, kind: "transfer", title: `Transferred ${formatCents(t.cents)} from ${t.fromName} to ${t.toName}`, lines: [`Dated ${t.date}`], cents: t.cents, atMs: t.createdAtMs, undone: false, canUndo: true, transferGroupId: t.groupId });
  }
  const byKey = new Map(out.map((e) => [e.key, e]));
  for (const e of out) if (e.kind === "undo" && e.undoOf) { const target = byKey.get(e.undoOf); if (target) e.title = `Undid: ${target.title}`; }
  return out.sort((a, b) => b.atMs - a.atMs);
}

export interface InverseRow { categoryId: string; month: string; amountCents: number; fundingAccountId: string | null; note: string }

/** The rows that cancel a move exactly: same pockets, same accounts, opposite sign. */
export function inverseRows(rows: readonly MoveRow[], key: string): InverseRow[] {
  return rows.filter((r) => r.amountCents !== 0).map((r) => ({ categoryId: r.categoryId, month: r.month, amountCents: -r.amountCents, fundingAccountId: r.fundingAccountId, note: undoNote(key, r.note) }));
}

/**
 * Can these undo rows be added safely? Returns a plain-language reason when not, or null when fine.
 * - A pocket must still hold, in each account, what the undo takes back out of it.
 * - The pool of an account (free cash) may not be pushed below zero by the undo.
 * `txPoolDelta` is how deleting a transfer changes each account's free cash (receiver down, sender up).
 */
export function undoProblem(a: {
  inverse: readonly InverseRow[];
  names: ReadonlyMap<string, string>;
  pocketNames: ReadonlyMap<string, string>;
  /** pocket id -> account id (or "none") -> cents the pocket holds now. */
  held: ReadonlyMap<string, ReadonlyMap<string, number>>;
  pools: ReadonlyMap<string | null, number>;
  txPoolDelta?: ReadonlyMap<string | null, number>;
}): string | null {
  const acct = (k: string | null) => (k ? a.names.get(k) ?? "an account" : "no account");
  const out = new Map<string, number>();
  for (const r of a.inverse) if (r.amountCents < 0) out.set(`${r.categoryId}|${r.fundingAccountId ?? "none"}`, (out.get(`${r.categoryId}|${r.fundingAccountId ?? "none"}`) ?? 0) - r.amountCents);
  for (const [k, need] of out) {
    const [cat, ac] = k.split("|");
    const have = a.held.get(cat)?.get(ac) ?? 0;
    if (have < need) return `${a.pocketNames.get(cat) ?? "A pocket"} no longer holds ${formatCents(need)} in ${acct(ac === "none" ? null : ac)} (it has ${formatCents(have)}), because that money was spent or moved since. Undo the newer moves first.`;
  }
  const delta = new Map<string | null, number>();
  for (const [k, n] of a.txPoolDelta ?? []) delta.set(k, (delta.get(k) ?? 0) + n);
  for (const r of a.inverse) delta.set(r.fundingAccountId, (delta.get(r.fundingAccountId) ?? 0) - r.amountCents);
  for (const [k, d] of delta) {
    if (d >= 0) continue;
    const after = (a.pools.get(k) ?? 0) + d;
    if (after < 0) return `Undoing this would leave ${acct(k)} with ${formatCents(-after)} less free cash than it has. Move or undo the pocket money that uses it first.`;
  }
  return null;
}
