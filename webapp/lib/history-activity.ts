import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deductibleAmount, kindFor } from "@/lib/history-math";
import { isDeductibleType } from "@/lib/history-math";

export interface HistoryWindow {
  /** Income by Type key (positive). Unclassified income uses UNCLASSIFIED_INCOME. */
  revenue: Map<string, number>;
  /** Expenses by Type key (positive; refunds net against them). Unclassified uses UNCLASSIFIED. */
  expenses: Map<string, number>;
  deductibleCents: number;
}

const empty = (): HistoryWindow => ({ revenue: new Map(), expenses: new Map(), deductibleCents: 0 });
const add = (m: Map<string, number>, k: string, c: number) => m.set(k, (m.get(k) ?? 0) + c);

/**
 * What the History layer holds for a window of dates (inclusive), by Type. Years typed in from a tax return count
 * when the window covers the whole year. Returns empty if the History tables do not exist yet.
 */
export async function historyActivity(workspaceId: string, from: string, to: string, isBusiness: boolean): Promise<HistoryWindow> {
  const out = empty();
  try {
    const rows = await prisma.$queryRaw<{ kind: string; typeKey: string | null; ded: boolean; cents: bigint }[]>(Prisma.sql`
      SELECT kind, "typeKey", "isTaxDeductible" AS ded, SUM("amountCents") AS cents
      FROM historical_transactions
      WHERE "workspaceId" = ${workspaceId} AND kind <> 'TRANSFER' AND "date" >= ${from}::date AND "date" <= ${to}::date
      GROUP BY 1, 2, 3`);
    for (const r of rows) {
      const cents = Number(r.cents);
      if (r.kind === "INCOME") add(out.revenue, r.typeKey ?? "UNCLASSIFIED_INCOME", cents);
      else { add(out.expenses, r.typeKey ?? "UNCLASSIFIED", -cents); if (r.ded) out.deductibleCents += deductibleAmount(-cents, r.typeKey); }
    }
    const y0 = Number(from.slice(0, 4)), y1 = Number(to.slice(0, 4));
    for (let y = y0; y <= y1; y++) {
      if (from > `${y}-01-01` || to < `${y}-12-31`) continue; // window must cover the whole year
      const totals = await prisma.historyTotal.findMany({ where: { workspaceId, year: y } });
      for (const t of totals) {
        if (kindFor(t.typeKey, 1) === "INCOME") add(out.revenue, t.typeKey, t.amountCents);
        else { add(out.expenses, t.typeKey, t.amountCents); if (isDeductibleType(t.typeKey, isBusiness)) out.deductibleCents += deductibleAmount(t.amountCents, t.typeKey); }
      }
    }
  } catch { /* History tables not created yet */ }
  return out;
}
