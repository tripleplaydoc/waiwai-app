import { prisma } from "@/lib/prisma";
import { PriceRefresher } from "@/components/price-refresher";

/** Keeps coin and share prices fresh from any screen, so the value history keeps building. Renders nothing visible. */
export async function AutoPrices() {
  let any = false;
  try { any = (await prisma.holdingPosition.count({ where: { account: { isArchived: false } } })) > 0; } catch { any = false; }
  return any ? <PriceRefresher silent /> : null;
}
