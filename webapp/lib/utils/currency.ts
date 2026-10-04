/**
 * Money helpers. Every amount in the database and in API payloads is an
 * integer number of CENTS. Floating point is never used for money: parsing
 * and formatting below work on strings and integers only.
 */

/** 150.25 dollars is stored as 15025. Returns the formatted string "$150.25". */
export function formatCents(cents: number, opts: { sign?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const withCommas = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = `$${withCommas}.${rem.toString().padStart(2, "0")}`;
  if (negative) return `-${body}`;
  return opts.sign && cents > 0 ? `+${body}` : body;
}

/** Plain editable string for inputs: 15025 -> "150.25", -500 -> "-5.00". */
export function centsToInput(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const body = `${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/**
 * Parses what a person types ("$1,234.56", "12", "(45.10)", "-5.5") into
 * integer cents. Returns null for anything that is not a clean amount with
 * at most two decimal places. Never rounds silently.
 */
export function parseToCents(input: string): number | null {
  let s = input.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }
  if (s.startsWith("$")) s = s.slice(1).trim();
  s = s.replace(/,/g, "");
  if (!/^\d*(\.\d{0,2})?$/.test(s) || s === "" || s === ".") return null;
  const [whole = "0", frac = ""] = s.split(".");
  const cents = parseInt(whole || "0", 10) * 100 + parseInt(frac.padEnd(2, "0") || "0", 10);
  if (!Number.isSafeInteger(cents) || cents > 2_000_000_000) return null; // Postgres INT limit
  return negative ? -cents : cents;
}
