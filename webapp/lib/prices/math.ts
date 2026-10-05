/**
 * Exact decimal math for coins and shares. Quantities and unit prices are fractional
 * (0.00421 BTC, $0.0000089 per coin), so they are handled as decimal strings / BigInt,
 * never floats. A value is rounded to whole cents only at the very end (half up).
 */
const SCALE = 12;

/** "12.345" -> 12345000000000n (12 decimal places). Returns null if it isn't a plain non-negative decimal. */
export function toScaled(text: string): bigint | null {
  const s = text.trim().replace(/,/g, "");
  if (!/^\d*\.?\d+$|^\d+\.?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const f = (frac + "0".repeat(SCALE)).slice(0, SCALE);
  // Anything beyond 12 places is rounded half up on the 13th digit.
  let v = BigInt(whole || "0") * 10n ** BigInt(SCALE) + BigInt(f || "0");
  if (frac.length > SCALE && frac.charCodeAt(SCALE) >= 53) v += 1n;
  return v;
}

/** Cleans a decimal string for storage (max 12 places, no commas); null if invalid. */
export function cleanDecimal(text: string): string | null {
  const v = toScaled(text);
  if (v === null) return null;
  const whole = v / 10n ** BigInt(SCALE), frac = (v % 10n ** BigInt(SCALE)).toString().padStart(SCALE, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** quantity × unit price, in whole cents (rounded half up). */
export function valueCents(quantity: string, price: string): number {
  const q = toScaled(quantity), p = toScaled(price);
  if (q === null || p === null) return 0;
  // q and p are scaled by 1e12 each, so q*p is scaled by 1e24; ×100 for cents.
  const num = q * p * 100n, den = 10n ** BigInt(SCALE * 2);
  return Number((num + den / 2n) / den);
}

/** Shows a quantity without trailing zeros, with thousands separators: 1234.5 -> "1,234.5". */
export function formatQuantity(q: string): string {
  const c = cleanDecimal(q) ?? q;
  const [w, f] = c.split(".");
  return w.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? `.${f}` : "");
}

/** Unit price for display: 2 decimals normally, more for sub-dollar coins ($0.0000089). */
export function formatUnitPrice(price: string): string {
  const c = cleanDecimal(price);
  if (c === null) return "—";
  const n = Number(c);
  const places = n >= 1 ? 2 : n >= 0.01 ? 4 : 8;
  const [w, f = ""] = n.toFixed(places).split(".");
  return `$${w.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${f ? "." + f : ""}`;
}
