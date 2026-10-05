import { valueCents, cleanDecimal, formatQuantity, formatUnitPrice, toScaled } from "./math";
import { parseCoinbase, parseCoinGecko, parseCoinGeckoSearch, parseYahoo, parseStooq, parseFinnhub, cryptoPrice, stockPrice, lookupPrices, type Fetcher } from "./providers";

let failed = 0;
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { failed++; console.error(`FAIL ${name}\n  got      ${JSON.stringify(a)}\n  expected ${JSON.stringify(b)}`); } else console.log(`ok   ${name}`);
};

// exact math
eq("0.5 BTC @ 60000.10", valueCents("0.5", "60000.10"), 3000005);
eq("tiny coin", valueCents("1000000000", "0.0000089"), 890000);
eq("rounds half up", valueCents("1", "0.005"), 1);
eq("rounds down below half", valueCents("1", "0.004"), 0);
eq("fractional shares", valueCents("12.345", "226.79"), 279972); // 2799.72255 -> $2,799.72
eq("big holdings no float error", valueCents("21000000", "100000.99"), 210002079000000);
eq("invalid input is zero", valueCents("abc", "1"), 0);
eq("clean strips commas/zeros", cleanDecimal("1,234.500"), "1234.5");
eq("clean rejects negatives", cleanDecimal("-1"), null);
eq("clean rejects junk", cleanDecimal("1e5"), null);
eq("clean trims >12 places", cleanDecimal("0.1234567890129"), "0.123456789013");
eq("scaled", String(toScaled("1.5")), "1500000000000");
eq("format qty", formatQuantity("1234.50"), "1,234.5");
eq("format price big", formatUnitPrice("60000.1"), "$60,000.10");
eq("format price tiny", formatUnitPrice("0.0000089"), "$0.00000890");

// parsers (documented response shapes)
eq("coinbase", parseCoinbase('{"data":{"amount":"63500.12","base":"BTC","currency":"USD"}}'), "63500.12");
eq("coinbase junk", parseCoinbase("<html>"), null);
eq("coinbase unknown", parseCoinbase('{"errors":[{"id":"not_found"}]}'), null);
eq("coingecko", parseCoinGecko('{"bitcoin":{"usd":63500.5}}', "bitcoin"), "63500.5");
eq("coingecko tiny exponent", parseCoinGecko('{"shiba-inu":{"usd":1.2e-5}}', "shiba-inu"), "0.000012");
eq("coingecko search picks best-ranked exact symbol", parseCoinGeckoSearch('{"coins":[{"id":"fake-eth","name":"Fake","symbol":"ETH","market_cap_rank":900},{"id":"ethereum","name":"Ethereum","symbol":"ETH","market_cap_rank":2},{"id":"x","name":"X","symbol":"ETHX","market_cap_rank":1}]}', "eth"), { id: "ethereum", name: "Ethereum" });
eq("yahoo", parseYahoo('{"chart":{"result":[{"meta":{"currency":"USD","symbol":"AAPL","regularMarketPrice":226.79,"longName":"Apple Inc."}}]}}'), { price: "226.79", name: "Apple Inc." });
eq("yahoo non-USD rejected", parseYahoo('{"chart":{"result":[{"meta":{"currency":"GBp","regularMarketPrice":100}}]}}'), null);
eq("yahoo error body", parseYahoo('{"chart":{"result":null,"error":{"code":"Not Found"}}}'), null);
eq("stooq", parseStooq("Symbol,Date,Time,Close\nAAPL.US,2026-10-02,22:00:12,226.79\n"), "226.79");
eq("stooq unknown", parseStooq("Symbol,Date,Time,Close\nZZZZ.US,N/D,N/D,N/D\n"), null);
eq("finnhub", parseFinnhub('{"c":226.79,"d":1,"dp":0.4}'), "226.79");
eq("finnhub unknown (0)", parseFinnhub('{"c":0,"d":null}'), null);

(async () => {
  const mk = (routes: Record<string, string | number>): { f: Fetcher; calls: string[] } => {
    const calls: string[] = [];
    return { calls, f: async (url) => {
      calls.push(url);
      const hit = Object.entries(routes).find(([k]) => url.includes(k));
      if (!hit) return { ok: false, status: 404, text: async () => "" };
      if (typeof hit[1] === "number") return { ok: false, status: hit[1], text: async () => "" };
      return { ok: true, status: 200, text: async () => hit[1] as string };
    } };
  };
  let m = mk({ "/v2/prices/BTC-USD/spot": '{"data":{"amount":"63500.12"}}' });
  eq("crypto via coinbase", await cryptoPrice("btc", m.f), { price: "63500.12", source: "Coinbase" });
  m = mk({ "coinbase": 500, "/api/v3/search": '{"coins":[{"id":"bitcoin","name":"Bitcoin","symbol":"BTC","market_cap_rank":1}]}', "simple/price": '{"bitcoin":{"usd":63000}}' });
  eq("crypto falls back to coingecko", await cryptoPrice("BTC", m.f), { price: "63000", source: "CoinGecko", name: "Bitcoin" });
  m = mk({});
  eq("crypto none found", await cryptoPrice("NOPE", m.f), null);
  m = mk({ "finance/chart/AAPL": '{"chart":{"result":[{"meta":{"currency":"USD","regularMarketPrice":226.79,"shortName":"Apple"}}]}}' });
  eq("stock via yahoo", await stockPrice("aapl", m.f), { price: "226.79", source: "Yahoo Finance", name: "Apple" });
  m = mk({ "finance/chart": 429, "/q/l/": "Symbol,Date,Time,Close\nVTI.US,2026-10-02,22:00:12,310.5\n" });
  eq("stock falls back to stooq", await stockPrice("VTI", m.f), { price: "310.5", source: "Stooq" });
  m = mk({ "/v2/prices/ETH-USD/spot": '{"data":{"amount":"2500"}}', "finance/chart/VTI": '{"chart":{"result":[{"meta":{"currency":"USD","regularMarketPrice":310.5}}]}}' });
  const got = await lookupPrices([{ kind: "CRYPTO", symbol: "eth" }, { kind: "CRYPTO", symbol: "ETH" }, { kind: "STOCK", symbol: "VTI" }, { kind: "STOCK", symbol: "ZZZZ" }], m.f);
  eq("lookup dedupes and skips failures", [...got.keys()].sort(), ["CRYPTO:ETH", "STOCK:VTI"]);
  eq("only one crypto call for duplicate symbol", m.calls.filter((c) => c.includes("ETH-USD")).length, 1);
  if (failed) { console.error(`${failed} failed`); process.exit(1); } else console.log("all price tests passed");
})();
