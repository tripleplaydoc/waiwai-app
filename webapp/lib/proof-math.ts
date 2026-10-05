import { formatCents } from "@/lib/utils/currency";

export interface ProofTx { id: string; date: string; amountCents: number; payee: string; cleared: boolean }

export interface Suspect { id: string; date: string; payee: string; amountCents: number; reason: string }
export interface Diagnosis {
  /** bank - app. Positive: the bank holds more than the app says. */
  gapCents: number;
  state: "match" | "pending" | "off";
  /** Plain-words headline. */
  headline: string;
  hints: string[];
  suspects: Suspect[];
}

const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00.000Z`) + d * 86400000).toISOString().slice(0, 10);
const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00.000Z`) - Date.parse(`${b}T00:00:00.000Z`)) / 86400000;

/**
 * Compare what the bank shows with what the app says, and look for the usual reasons they differ.
 * `txs` should be this account's recent transactions (already limited to the window worth searching).
 * Amounts are signed on the account's ledger (credit cards: purchases are negative).
 */
export function diagnoseGap(o: { bankCents: number; appCents: number; today: string; txs: ProofTx[] }): Diagnosis {
  const gap = o.bankCents - o.appCents;
  if (gap === 0) return { gapCents: 0, state: "match", headline: "Matches your bank.", hints: [], suspects: [] };
  const abs = Math.abs(gap);
  const hints: string[] = [];
  const suspects: Suspect[] = [];
  const add = (t: ProofTx, reason: string, force = false) => {
    const have = suspects.find((s) => s.id === t.id);
    if (have) { if (force) have.reason = reason; return; }
    suspects.push({ id: t.id, date: t.date, payee: t.payee, amountCents: t.amountCents, reason });
  };

  // 1. Entries the bank has not posted yet explain the whole gap when the app's uncleared total equals it.
  const uncleared = o.txs.filter((t) => !t.cleared);
  const unclearedSum = uncleared.reduce((s, t) => s + t.amountCents, 0);
  if (uncleared.length > 0 && unclearedSum === -gap) {
    uncleared.forEach((t) => add(t, "Not marked cleared yet"));
    return { gapCents: gap, state: "pending", headline: `Matches once ${uncleared.length} pending ${uncleared.length === 1 ? "entry posts" : "entries post"}.`, hints: [`The ${uncleared.length} uncleared ${uncleared.length === 1 ? "entry totals" : "entries total"} ${formatCents(Math.abs(unclearedSum))}, which is exactly the gap. Nothing is wrong; the bank has not posted them yet.`], suspects };
  }

  // 2. Missing entries: a transaction the bank has that the app does not.
  if (gap > 0) hints.push(`The bank has ${formatCents(abs)} more than the app. Look for a ${formatCents(abs)} deposit you have not entered, or an expense entered for too much.`);
  else hints.push(`The bank has ${formatCents(abs)} less than the app. Look for a ${formatCents(abs)} payment or fee you have not entered, or a deposit entered for too much.`);

  // 3. Same amount already in the app: wrong side, or entered twice.
  for (const t of o.txs) {
    if (t.amountCents === -gap) add(t, gap > 0 ? "Same size as the gap, entered as money out. Wrong amount or wrong direction?" : "Same size as the gap, entered as money in. Wrong amount or wrong direction?");
    if (Math.abs(t.amountCents) * 2 === abs && Math.sign(t.amountCents) === -Math.sign(gap)) add(t, "Half the gap: its sign may be flipped");
  }

  // 4. Entered twice: same amount and payee within three days.
  const sorted = [...o.txs].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length && daysApart(sorted[i].date, sorted[j].date) <= 3; j++) {
    const a = sorted[i], b = sorted[j];
    if (a.amountCents === b.amountCents && a.payee.toLowerCase() === b.payee.toLowerCase() && Math.abs(a.amountCents) === abs && Math.sign(a.amountCents) === Math.sign(-gap)) { add(a, "Possible duplicate", true); add(b, "Possible duplicate", true); }
  }
  if (suspects.some((s) => s.reason === "Possible duplicate")) hints.push("Two entries look identical and together would explain the gap. Check whether one was entered twice.");

  // 5. Typing slips.
  if (abs >= 900 && abs % 900 === 0) hints.push("The gap divides evenly by 9. That often means two digits were swapped in an amount or in the balance you typed.");
  if (abs % 100 === 0 && abs <= 100000) hints.push("A whole-dollar gap often means a missing or doubled round-number entry, like a transfer.");
  // 6. Recent entries are the most likely to differ from the bank's posted balance.
  const recent = o.txs.filter((t) => daysApart(t.date, o.today) <= 3);
  if (recent.length > 0 && suspects.length === 0) { hints.push("Entries from the last few days may not have posted at the bank. Compare again after they clear."); }
  return { gapCents: gap, state: "off", headline: `Off by ${formatCents(abs)}.`, hints: hints.slice(0, 4), suspects: suspects.slice(0, 6) };
}

export type ProofState = "never" | "matched" | "stale" | "off";
export interface ProofSummary { state: ProofState; label: string; days: number | null; gapCents: number }
export interface CheckpointLite { date: string; gapCents: number; adjustedCents: number }

/** The one-line proof an account shows: when it last matched the bank. */
export function proofFor(latest: CheckpointLite | null, today: string, staleDays = 14): ProofSummary {
  if (!latest) return { state: "never", label: "Not checked against your bank yet", days: null, gapCents: 0 };
  const days = Math.round(daysApart(latest.date, today));
  const resolved = latest.gapCents === 0 || latest.adjustedCents === latest.gapCents;
  if (!resolved) return { state: "off", label: `Off ${formatCents(Math.abs(latest.gapCents - latest.adjustedCents))} at last check`, days, gapCents: latest.gapCents - latest.adjustedCents };
  const when = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  if (days > staleDays) return { state: "stale", label: `Matched your bank ${when}. Time to check again`, days, gapCents: 0 };
  return { state: "matched", label: `Matched your bank ${when}`, days, gapCents: 0 };
}

export const weekAgo = (iso: string) => addDays(iso, -7);
