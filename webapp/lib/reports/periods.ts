export type Preset = "month" | "last-month" | "quarter" | "last-quarter" | "ytd" | "last-year" | "custom";
export const PRESETS: { value: Preset; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "quarter", label: "This quarter" },
  { value: "last-quarter", label: "Last quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "last-year", label: "Last year" },
  { value: "custom", label: "Custom dates" },
];

export interface Period { preset: Preset; from: string; to: string; prevFrom: string; prevTo: string; label: string }

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const isIso = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const fmt = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function resolvePeriod(presetParam: string | undefined, fromParam: string | undefined, toParam: string | undefined, today: string): Period {
  const preset = PRESETS.some((p) => p.value === presetParam) ? (presetParam as Preset) : "month";
  const y = +today.slice(0, 4), m = +today.slice(5, 7) - 1;
  let from: string, to: string, prevFrom: string, prevTo: string;
  const quarterStart = Math.floor(m / 3) * 3;
  switch (preset) {
    case "last-month":
      from = iso(y, m - 1, 1); to = iso(y, m, 0); prevFrom = iso(y, m - 2, 1); prevTo = iso(y, m - 1, 0); break;
    case "quarter":
      from = iso(y, quarterStart, 1); to = iso(y, quarterStart + 3, 0); prevFrom = iso(y, quarterStart - 3, 1); prevTo = iso(y, quarterStart, 0); break;
    case "last-quarter":
      from = iso(y, quarterStart - 3, 1); to = iso(y, quarterStart, 0); prevFrom = iso(y, quarterStart - 6, 1); prevTo = iso(y, quarterStart - 3, 0); break;
    case "ytd":
      from = iso(y, 0, 1); to = today; prevFrom = iso(y - 1, 0, 1); prevTo = iso(y - 1, m, Math.min(+today.slice(8, 10), lastDay(y - 1, m))); break;
    case "last-year":
      from = iso(y - 1, 0, 1); to = iso(y - 1, 11, 31); prevFrom = iso(y - 2, 0, 1); prevTo = iso(y - 2, 11, 31); break;
    case "custom": {
      from = isIso(fromParam) ? fromParam : iso(y, m, 1);
      to = isIso(toParam) ? toParam : today;
      if (from > to) [from, to] = [to, from];
      const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
      const pt = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000);
      prevTo = pt.toISOString().slice(0, 10); prevFrom = new Date(pt.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10); break;
    }
    default:
      from = iso(y, m, 1); to = iso(y, m, lastDay(y, m)); prevFrom = iso(y, m - 1, 1); prevTo = iso(y, m, 0);
  }
  return { preset, from, to, prevFrom, prevTo, label: `${fmt(from)} – ${fmt(to)}` };
}
