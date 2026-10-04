/** Serializable view of the Personal Give / Save / Live flow (safe to pass to client components). */
import type { PersonalBucket } from "./personal-flow";

export interface PersonalPocketVM { id: string; name: string; balanceCents: number; needCents: number; shareBps: number }
export interface PersonalBucketVM {
  key: PersonalBucket;
  label: string;
  bps: number;
  groupIds: string[];
  groupNames: string[];
  balanceCents: number;
  needCents: number;
  pockets: PersonalPocketVM[];
}
export interface PersonalFlowVM {
  enabled: boolean;
  buckets: PersonalBucketVM[];
  groups: { id: string; name: string }[];
}
