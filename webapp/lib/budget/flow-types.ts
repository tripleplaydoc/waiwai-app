/** Serializable view of the cashflow waterfall for one workspace + month (safe to pass to client components). */
export interface FlowPocketVM { id: string; name: string; balanceCents: number }
export interface FlowCashPocketVM extends FlowPocketVM { bps: number }
export interface FlowVM {
  enabled: boolean;
  taxBps: number;
  reservoir1Months: number;
  reservoir2Months: number;
  reservoir2ShareBps: number;
  tax: FlowPocketVM | null;
  opexGroupId: string | null;
  opexGroupName: string | null;
  /** Sum of the monthly costs on the OPEX pockets. */
  monthlyOpexCents: number;
  /** Money sitting in OPEX pockets (positive balances). */
  opexBalanceCents: number;
  /** Still needed to bring every OPEX pocket up to its target. */
  opexNeedCents: number;
  reservoir1: (FlowPocketVM & { targetCents: number }) | null;
  reservoir2: (FlowPocketVM & { targetCents: number }) | null;
  cash: FlowCashPocketVM[];
  cashBalanceCents: number;
  cashPctBps: number;
  /** Money pulled from reserves that new income pays back first. */
  owed: { bucket: "TAXES" | "RESERVOIR_1" | "RESERVOIR_2"; cents: number }[];
  owedCents: number;
  /** OPEX pockets that are overspent. */
  overspent: { id: string; name: string; cents: number }[];
  groups: { id: string; name: string }[];
}
