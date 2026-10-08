/**
 * Stewardship ring: where this month's money went, as Give / Save / Live. Pure math, integer cents, no database.
 *
 *   Give  = money given away (tithing, gifts, donations)
 *   Save  = money kept: transfers into savings / investment / asset accounts, and spending filed in a saving pocket
 *   Live  = everything else that was spent
 *
 * When the budget has Give / Save / Live flow buckets set up (personal_flow_configs), each pocket's category is
 * placed by that setup (the Reservoirs bucket counts as Save: it is money kept). Otherwise we fall back to a
 * sensible guess from category and pocket names, and the card says so.
 */

export type StewardBucket = "GIVE" | "SAVE" | "LIVE";
export const STEWARD_BUCKETS: StewardBucket[] = ["GIVE", "SAVE", "LIVE"];
export const STEWARD_LABEL: Record<StewardBucket, string> = { GIVE: "Give", SAVE: "Save", LIVE: "Live" };

/** One piece of money that went out this month (positive cents; a refund is negative). */
export interface OutflowEntry {
  cents: number;
  /** What to call it in the list, e.g. the pocket name or "Moved to Savings". */
  label: string;
  /** Moved into a savings / investment / asset account: always counts as Save. */
  kept?: boolean;
  /** The pocket feeds an asset or is set aside for the next generation: counts as Save (unless the flow setup puts its category in Give). */
  keeps?: boolean;
  groupId: string | null;
  groupName: string | null;
}

/** Category-group ids per flow bucket (null / all empty = flow buckets not set up). */
export interface FlowMapping { give: string[]; save: string[]; live: string[]; reserve: string[] }

export interface StewardSlice { key: StewardBucket; label: string; cents: number; pct: number; top: { label: string; cents: number }[] }
export interface Stewardship {
  /** "flow" = grouped by the Give / Save / Live setup, "names" = guessed from category names. */
  mode: "flow" | "names";
  totalCents: number;
  slices: StewardSlice[];
  caption: string;
}

export function hasFlowMapping(m: FlowMapping | null | undefined): m is FlowMapping {
  return !!m && m.give.length + m.save.length + m.live.length + m.reserve.length > 0;
}

const GIVE_WORDS = /\b(give|giving|gift|gifts|tith\w*|donat\w*|charit\w*|offering\w*|generos\w*|aloha|church|mission|missionary|fast offering)\b/i;
const SAVE_WORDS = /\b(sav\w*|invest\w*|emergency|retire\w*|reserve\w*|college|529|ira|roth|brokerage|goal|goals|rainy day|nest egg|gold|legacy)\b/i;

/** Name-based guess, used only when the budget has no Give / Save / Live setup. */
export function bucketByName(groupName: string | null, label: string): StewardBucket {
  const text = `${groupName ?? ""} ${label}`;
  if (GIVE_WORDS.test(text)) return "GIVE";
  if (SAVE_WORDS.test(text)) return "SAVE";
  return "LIVE";
}

export function bucketFor(e: OutflowEntry, map: FlowMapping | null): StewardBucket {
  if (e.kept) return "SAVE";
  if (hasFlowMapping(map)) {
    const g = e.groupId ?? "\u0000";
    if (map.give.includes(g)) return "GIVE";
    if (map.save.includes(g) || map.reserve.includes(g) || e.keeps) return "SAVE";
    return "LIVE";
  }
  if (e.keeps) return "SAVE";
  return bucketByName(e.groupName, e.label);
}

/** Whole-number percents that add up to exactly 100 (largest remainder). All zeros when there is nothing. */
export function percentSplit(cents: number[]): number[] {
  const total = cents.reduce((s, c) => s + Math.max(0, c), 0);
  if (total <= 0) return cents.map(() => 0);
  const exact = cents.map((c) => (Math.max(0, c) * 100) / total);
  const out = exact.map(Math.floor);
  let rem = 100 - out.reduce((s, n) => s + n, 0);
  const order = exact.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of order) { if (rem <= 0) break; out[i]++; rem--; }
  return out;
}

/** One calm, reflective sentence about where the water is going. */
export function stewardCaption(cents: Record<StewardBucket, number>): string {
  const live = cents.LIVE > 0, save = cents.SAVE > 0, give = cents.GIVE > 0;
  if (!live && !save && !give) return "";
  if (!save && !give) return "Your water is all supporting life today. When you are ready, even a small stream toward saving or giving makes a difference.";
  const parts: string[] = [];
  if (live) parts.push("your life today");
  if (save) parts.push("your future");
  if (give) parts.push("the people and causes you care about");
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}${parts.length > 2 ? "," : ""} and ${parts[parts.length - 1]}`;
  return `Your water supports ${list}.`;
}

export function buildStewardship(entries: OutflowEntry[], map: FlowMapping | null): Stewardship {
  const mode: Stewardship["mode"] = hasFlowMapping(map) ? "flow" : "names";
  const byLabel: Record<StewardBucket, Map<string, number>> = { GIVE: new Map(), SAVE: new Map(), LIVE: new Map() };
  for (const e of entries) {
    if (!Number.isFinite(e.cents) || e.cents === 0) continue;
    const b = bucketFor(e, map);
    byLabel[b].set(e.label, (byLabel[b].get(e.label) ?? 0) + Math.round(e.cents));
  }
  const slicesRaw = STEWARD_BUCKETS.map((key) => {
    const top = [...byLabel[key].entries()].filter(([, c]) => c > 0).map(([label, cents]) => ({ label, cents })).sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label));
    // A refund can make one pocket net negative; the bucket total is just what is still out after refunds.
    const cents = Math.max(0, [...byLabel[key].values()].reduce((s, c) => s + c, 0));
    return { key, label: STEWARD_LABEL[key], cents, top: top.slice(0, 4) };
  });
  const pcts = percentSplit(slicesRaw.map((s) => s.cents));
  const slices: StewardSlice[] = slicesRaw.map((s, i) => ({ ...s, pct: pcts[i] }));
  const totalCents = slices.reduce((s, x) => s + x.cents, 0);
  return { mode, totalCents, slices, caption: stewardCaption({ GIVE: slices[0].cents, SAVE: slices[1].cents, LIVE: slices[2].cents }) };
}
