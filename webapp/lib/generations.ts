/**
 * "For the next generation": pockets set aside as a long-term gift. Pure, integer cents, no projections:
 * we only report what is saved now against the goals that have been set.
 * (Hawaiian wording here, "Moʻopuna" (grandchild), should be checked by a Hawaiian-language speaker.)
 */

export interface LegacyPocket { id: string; name: string; savedCents: number; targetCents: number | null }
export interface GenerationsTotals {
  count: number;
  savedCents: number;
  /** Sum of the goals that were set (pockets without a goal add nothing here). */
  targetCents: number;
  /** 0..1 progress across the pockets that have a goal, each capped at its own goal. */
  fraction: number;
  allReached: boolean;
}

export function generationsTotals(pockets: LegacyPocket[]): GenerationsTotals {
  const saved = (p: LegacyPocket) => Math.max(0, p.savedCents);
  const withGoal = pockets.filter((p) => (p.targetCents ?? 0) > 0);
  const targetCents = withGoal.reduce((s, p) => s + (p.targetCents as number), 0);
  const toward = withGoal.reduce((s, p) => s + Math.min(saved(p), p.targetCents as number), 0);
  return {
    count: pockets.length,
    savedCents: pockets.reduce((s, p) => s + saved(p), 0),
    targetCents,
    fraction: targetCents > 0 ? Math.min(1, toward / targetCents) : 0,
    allReached: withGoal.length > 0 && withGoal.length === pockets.length && toward >= targetCents,
  };
}

/** A gentle long-view line. No forecasts, no promises. */
export function generationsCaption(t: GenerationsTotals, forKid = false): string {
  if (t.count === 0) return "";
  if (t.savedCents <= 0) return forKid ? "Every big thing starts small. There is no rush." : "Every long journey begins with one seed. There is no rush.";
  if (t.allReached) return forKid ? "You did it. This gift is fully saved." : "These gifts are fully funded. Mahalo for planting them.";
  return forKid ? "What you save now can still be growing when you are grown. Small and steady is enough." : "A long view: what you set aside today is meant to outlast this year. Small and steady is enough.";
}
