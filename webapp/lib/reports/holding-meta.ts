import "server-only";
import { prisma } from "@/lib/prisma";
import { valueCents } from "@/lib/prices/math";

export interface PositionVM {
  id: string; kind: "CRYPTO" | "STOCK"; symbol: string; name: string | null; quantity: string;
  price: string | null; priceAt: string | null; priceSource: string | null;
  valueCents: number; costBasisCents: number | null;
}
export interface MetaVM {
  accountId: string;
  positions: PositionVM[];
  cashCents: number;
  costBasisCents: number | null; purchaseDate: string | null; notes: string | null; linkedLoanId: string | null;
  aprBps: number | null; termMonths: number | null; originalCents: number | null; loanStartDate: string | null;
  vin: string | null; year: number | null; make: string | null; model: string | null; trim: string | null; mileage: number | null;
  /** When the last hand-entered or auto value was recorded. */
  valuedOn: string | null;
  /** Latest price time across positions. */
  pricedAt: string | null;
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Details, positions and last-valued date for a set of holdings, keyed by account id. */
export async function loadHoldingMeta(accountIds: string[]): Promise<Map<string, MetaVM>> {
  const out = new Map<string, MetaVM>();
  if (accountIds.length === 0) return out;
  const [details, positions, latest] = await Promise.all([
    prisma.holdingDetail.findMany({ where: { accountId: { in: accountIds } } }),
    prisma.holdingPosition.findMany({ where: { accountId: { in: accountIds } }, orderBy: { symbol: "asc" } }),
    prisma.manualBalanceEntry.groupBy({ by: ["accountId"], where: { accountId: { in: accountIds } }, _max: { asOfDate: true } }),
  ]);
  for (const id of accountIds) {
    const d = details.find((x) => x.accountId === id);
    const pos: PositionVM[] = positions.filter((p) => p.accountId === id).map((p) => {
      const price = p.lastPrice ? p.lastPrice.toFixed() : null;
      return { id: p.id, kind: p.kind, symbol: p.symbol, name: p.name, quantity: p.quantity.toFixed(), price, priceAt: p.priceAt ? p.priceAt.toISOString() : null, priceSource: p.priceSource, valueCents: price ? valueCents(p.quantity.toFixed(), price) : 0, costBasisCents: p.costBasisCents };
    });
    const times = pos.map((p) => p.priceAt).filter((t): t is string => !!t).sort();
    out.set(id, {
      accountId: id, positions: pos, cashCents: d?.cashCents ?? 0,
      costBasisCents: d?.costBasisCents ?? null, purchaseDate: iso(d?.purchaseDate ?? null), notes: d?.notes ?? null, linkedLoanId: d?.linkedLoanId ?? null,
      aprBps: d?.interestRateBps ?? null, termMonths: d?.termMonths ?? null, originalCents: d?.originalAmountCents ?? null, loanStartDate: iso(d?.loanStartDate ?? null),
      vin: d?.vin ?? null, year: d?.vehicleYear ?? null, make: d?.vehicleMake ?? null, model: d?.vehicleModel ?? null, trim: d?.vehicleTrim ?? null, mileage: d?.mileage ?? null,
      valuedOn: iso(latest.find((l) => l.accountId === id)?._max.asOfDate ?? null),
      pricedAt: times.length ? times[0] : null, // oldest price = how fresh the whole account is
    });
  }
  return out;
}
