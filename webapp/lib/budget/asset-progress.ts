/**
 * Progress of an asset toward the value you want it to reach.
 *
 * This is the asset's own current value (not the money waiting in its pocket): the pocket holds what you have set
 * aside to put into the asset, the asset bar shows what the asset is worth now.
 */
export interface AssetProgress {
  hasGoal: boolean;
  /** 0 to 1 for the bar; 0 when no goal is set. */
  fraction: number;
  reached: boolean;
  /** How far the asset still is from the goal (0 once reached or without a goal). */
  remainingCents: number;
}

export function assetProgress(valueCents: number, goalCents: number | null): AssetProgress {
  const value = Math.max(0, Math.round(valueCents));
  if (goalCents === null || !Number.isFinite(goalCents) || goalCents <= 0) {
    return { hasGoal: false, fraction: 0, reached: false, remainingCents: 0 };
  }
  const goal = Math.round(goalCents);
  return {
    hasGoal: true,
    fraction: Math.min(1, value / goal),
    reached: value >= goal,
    remainingCents: Math.max(0, goal - value),
  };
}
