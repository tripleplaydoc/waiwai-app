/**
 * "Can I afford it?" — checks a planned purchase against the pocket it would
 * come from and, when the pocket falls short, suggests where to borrow.
 * Pure integer-cents math; no database access.
 */
export interface AffordPocket {
  id: string;
  name: string;
  availableCents: number;
  targetType: "MONTHLY_FUNDING" | "TARGET_BALANCE" | "TARGET_BALANCE_BY_DATE" | null;
  targetCents: number | null;
  dueDay: number | null;
  isSystemManaged: boolean;
}

export type SourceTier = "ready" | "free" | "spare" | "goal" | "bill";
export interface Source { pocketId: string | null; name: string; cents: number; tier: SourceTier; note: string }

export interface AffordResult {
  verdict: "yes" | "yes_after_moves" | "partly" | "no";
  pocketAvailableCents: number;
  leftAfterCents: number;
  shortfallCents: number;
  sources: Source[];
  coveredCents: number;
  stillShortCents: number;
  warning: string | null;
}

const TIER_ORDER: SourceTier[] = ["ready", "free", "spare", "goal", "bill"];
const fmt = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function planPurchase(input: { amountCents: number; pocket: AffordPocket; pockets: AffordPocket[]; readyToAssignCents: number }): AffordResult {
  const { amountCents, pocket } = input;
  const have = Math.max(0, pocket.availableCents);

  if (have >= amountCents) {
    const left = have - amountCents;
    let warning: string | null = null;
    if (pocket.targetType === "MONTHLY_FUNDING" && pocket.targetCents && have >= pocket.targetCents && left < pocket.targetCents) {
      warning = `That would leave ${pocket.name} below its ${fmt(pocket.targetCents)} monthly cost.`;
    } else if ((pocket.targetType === "TARGET_BALANCE" || pocket.targetType === "TARGET_BALANCE_BY_DATE") && pocket.targetCents) {
      warning = `This pocket is a savings goal, so spending from it sets the goal back.`;
    }
    return { verdict: "yes", pocketAvailableCents: have, leftAfterCents: left, shortfallCents: 0, sources: [], coveredCents: 0, stillShortCents: 0, warning };
  }

  const shortfall = amountCents - have;
  const sources: Source[] = [];
  const ready = Math.min(Math.max(0, input.readyToAssignCents), shortfall);
  if (ready > 0) sources.push({ pocketId: null, name: "Ready to assign", cents: ready, tier: "ready", note: "Unassigned income. Nothing else is touched." });

  const candidates: (Source & { room: number })[] = [];
  for (const p of input.pockets) {
    if (p.id === pocket.id || p.isSystemManaged || p.availableCents <= 0) continue;
    const isGoal = p.targetType === "TARGET_BALANCE" || p.targetType === "TARGET_BALANCE_BY_DATE";
    const isBill = p.targetType === "MONTHLY_FUNDING" || p.dueDay !== null;
    if (isGoal) {
      candidates.push({ pocketId: p.id, name: p.name, cents: 0, room: p.availableCents, tier: "goal", note: "A savings goal. Borrowing sets it back." });
    } else if (isBill) {
      const need = p.targetCents ?? p.availableCents;
      const spare = Math.max(0, p.availableCents - need);
      if (spare > 0) candidates.push({ pocketId: p.id, name: p.name, cents: 0, room: spare, tier: "spare", note: `Has more than its ${fmt(need)} monthly cost.` });
      const rest = p.availableCents - spare;
      if (rest > 0) candidates.push({ pocketId: p.id, name: p.name, cents: 0, room: rest, tier: "bill", note: "Covers a bill. Borrowing could leave it underfunded." });
    } else {
      candidates.push({ pocketId: p.id, name: p.name, cents: 0, room: p.availableCents, tier: "free", note: "No bill or goal attached." });
    }
  }
  candidates.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || b.room - a.room);

  let remaining = shortfall - ready;
  for (const c of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(c.room, remaining);
    if (take <= 0) continue;
    sources.push({ pocketId: c.pocketId, name: c.name, cents: take, tier: c.tier, note: c.note });
    remaining -= take;
  }
  const covered = shortfall - remaining;
  return {
    verdict: remaining === 0 ? "yes_after_moves" : covered > 0 ? "partly" : "no",
    pocketAvailableCents: have, leftAfterCents: 0, shortfallCents: shortfall, sources, coveredCents: covered, stillShortCents: remaining, warning: null,
  };
}
