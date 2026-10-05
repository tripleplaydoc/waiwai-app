/**
 * Live price lookups. No account or key is needed for the defaults:
 *  - Crypto: Coinbase public spot price (by symbol), CoinGecko as the backup.
 *  - Stocks/funds: Finnhub if FINNHUB_API_KEY is set, then Yahoo Finance's public chart feed, then Stooq.
 * Each parser is a small pure function so it can be tested on saved responses.
 * Prices are returned as decimal STRINGS (USD per unit) to avoid float error.
 */
import { cleanDecimal } from "./math";

export type Fetcher = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
export interface PriceHit { price: string; source: string; name?: string }

const env = (k: string, d: string) => process.env[k] || d;
export const bases = () => ({
  coinbase: env("COINBASE_BASE", "https://api.coinbase.com"),
  coingecko: env("COINGECKO_BASE", "https://api.coingecko.com"),
  yahoo: env("YAHOO_BASE", "https://query1.finance.yahoo.com"),
  stooq: env("STOOQ_BASE", "https://stooq.com"),
  finnhub: env("FINNHUB_BASE", "https://finnhub.io"),
});

const UA = { "User-Agent": "Mozilla/5.0 (compatible; WaiWai/1.0)", Accept: "application/json,text/csv,*/*" };

/** Real network fetch with a timeout so a slow provider never stalls a page. */
export const realFetch: Fetcher = async (url, init) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { ...UA, ...(init?.headers ?? {}) }, signal: ctl.signal, cache: "no-store" });
    return { ok: r.ok, status: r.status, text: () => r.text() };
  } finally { clearTimeout(t); }
};

const positive = (v: unknown): string | null => {
  const c = typeof v === "number" ? (Number.isFinite(v) ? String(v) : null) : typeof v === "string" ? cleanDecimal(v) : null;
  if (c === null) return null;
  // Numbers in exponent form (1e-7) -> plain decimal
  const plain = /e/i.test(c) ? Number(c).toFixed(12) : c;
  const clean = cleanDecimal(plain);
  return clean && Number(clean) > 0 ? clean : null;
};

// ---------------------------------------------------------------- parsers
export function parseCoinbase(body: string): string | null {
  try { return positive(JSON.parse(body)?.data?.amount); } catch { return null; }
}
export function parseCoinGecko(body: string, id: string): string | null {
  try { return positive(JSON.parse(body)?.[id]?.usd); } catch { return null; }
}
export function parseCoinGeckoSearch(body: string, symbol: string): { id: string; name: string } | null {
  try {
    const coins: { id: string; name: string; symbol: string; market_cap_rank: number | null }[] = JSON.parse(body)?.coins ?? [];
    const m = coins.filter((c) => c.symbol?.toUpperCase() === symbol.toUpperCase()).sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9))[0];
    return m ? { id: m.id, name: m.name } : null;
  } catch { return null; }
}
export function parseYahoo(body: string): { price: string; name?: string } | null {
  try {
    const meta = JSON.parse(body)?.chart?.result?.[0]?.meta;
    const p = positive(meta?.regularMarketPrice);
    if (!p) return null;
    // Some London-listed funds quote in pence (GBp); we only support USD.
    if (meta.currency && String(meta.currency).toUpperCase() !== "USD") return null;
    return { price: p, name: meta.longName ?? meta.shortName };
  } catch { return null; }
}
export function parseStooq(body: string): string | null {
  // "Symbol,Date,Time,Close\nAAPL.US,2026-10-02,22:00:12,226.79" ; unknown symbols come back as N/D.
  const lines = body.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const cols = lines[1].split(",");
  return positive(cols[cols.length - 1]);
}
export function parseFinnhub(body: string): string | null {
  try { return positive(JSON.parse(body)?.c); } catch { return null; }
}

// ---------------------------------------------------------------- lookups
const get = async (f: Fetcher, url: string, headers?: Record<string, string>) => {
  try { const r = await f(url, { headers }); return r.ok ? await r.text() : null; } catch { return null; }
};

const enc = encodeURIComponent;

export async function cryptoPrice(symbol: string, f: Fetcher = realFetch): Promise<PriceHit | null> {
  const b = bases(), sym = symbol.toUpperCase();
  const cb = await get(f, `${b.coinbase}/v2/prices/${enc(sym)}-USD/spot`);
  const p1 = cb && parseCoinbase(cb);
  if (p1) return { price: p1, source: "Coinbase" };
  // Backup: CoinGecko (find the coin by symbol, then price it)
  const key = process.env.COINGECKO_API_KEY;
  const h = key ? { "x-cg-demo-api-key": key } : undefined;
  const search = await get(f, `${b.coingecko}/api/v3/search?query=${enc(sym)}`, h);
  const coin = search && parseCoinGeckoSearch(search, sym);
  if (!coin) return null;
  const px = await get(f, `${b.coingecko}/api/v3/simple/price?ids=${enc(coin.id)}&vs_currencies=usd`, h);
  const p2 = px && parseCoinGecko(px, coin.id);
  return p2 ? { price: p2, source: "CoinGecko", name: coin.name } : null;
}

export async function stockPrice(symbol: string, f: Fetcher = realFetch): Promise<PriceHit | null> {
  const b = bases(), sym = symbol.toUpperCase();
  const key = process.env.FINNHUB_API_KEY;
  if (key) {
    const fh = await get(f, `${b.finnhub}/api/v1/quote?symbol=${enc(sym)}&token=${enc(key)}`);
    const p = fh && parseFinnhub(fh);
    if (p) return { price: p, source: "Finnhub" };
  }
  // Yahoo writes share classes with a dash (BRK-B), people type BRK.B.
  const y = await get(f, `${b.yahoo}/v8/finance/chart/${enc(sym.replace(".", "-"))}?interval=1d&range=1d`);
  const yp = y && parseYahoo(y);
  if (yp) return { price: yp.price, source: "Yahoo Finance", name: yp.name };
  const s = await get(f, `${b.stooq}/q/l/?s=${enc(sym.toLowerCase())}.us&f=sd2t2c&h&e=csv`);
  const sp = s && parseStooq(s);
  return sp ? { price: sp, source: "Stooq" } : null;
}

/** One price per distinct symbol; failures are simply missing from the result. */
export async function lookupPrices(items: { kind: "CRYPTO" | "STOCK"; symbol: string }[], f: Fetcher = realFetch): Promise<Map<string, PriceHit>> {
  const uniq = [...new Map(items.map((i) => [`${i.kind}:${i.symbol.toUpperCase()}`, i])).values()];
  const out = new Map<string, PriceHit>();
  // Small batches keep us polite to the free APIs.
  for (let i = 0; i < uniq.length; i += 5) {
    await Promise.all(uniq.slice(i, i + 5).map(async (it) => {
      const hit = it.kind === "CRYPTO" ? await cryptoPrice(it.symbol, f) : await stockPrice(it.symbol, f);
      if (hit) out.set(`${it.kind}:${it.symbol.toUpperCase()}`, hit);
    }));
  }
  return out;
}
