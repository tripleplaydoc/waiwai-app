import { Droplets } from "lucide-react";
import { Donut } from "@/components/donut";
import { Hint } from "@/components/hint";
import { formatCents } from "@/lib/utils/currency";
import type { StewardBucket, Stewardship } from "@/lib/stewardship";

const COLOR: Record<StewardBucket, string> = { GIVE: "#7C3AED", SAVE: "#0E7C86", LIVE: "#2E6BE6" };
const EXPLAIN: Record<StewardBucket, string> = {
  GIVE: "Money you gave away this month: tithing, gifts and donations.",
  SAVE: "Money you kept: moved into a savings, investment or asset account, or spent from a saving pocket (like a gold or goal fund). It is still yours, just out of daily reach.",
  LIVE: "Everything else you spent: bills, food, fun and the rest of daily life.",
};

/** "Where your water went this month": a ring of money out, grouped Give / Save / Live, with one reflective line. */
export function StewardshipCard({ data, monthLabel }: { data: Stewardship; monthLabel: string }) {
  const empty = data.totalCents <= 0;
  return (
    <section className="card p-4 sm:p-5" aria-label="Where your water went this month">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Droplets className="size-4 text-water" aria-hidden />Where your water went this month
        <Hint>Waiwai means wealth, and wai means water. Like water, money is meant to keep moving: some to give, some to keep, and some to live on. This ring shows how this month&apos;s money out divided among the three. There is no right shape, only the one you choose.</Hint>
      </h2>
      <p className="text-xs text-slate-500">{monthLabel}, so far</p>

      {empty ? (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          No spending yet this month. As money flows out, you will see here how it is shared between giving, saving and living.
        </p>
      ) : (
        <>
          <div className="mt-3 grid items-center gap-4 sm:grid-cols-[12rem_1fr]">
            <div className="mx-auto w-full max-w-[12rem]">
              <Donut animate legend={false} centerLabel="Money out" centerValue={formatCents(data.totalCents)}
                slices={data.slices.filter((s) => s.cents > 0).map((s) => ({ key: s.key, label: s.label, cents: s.cents, color: COLOR[s.key] }))} />
            </div>
            <ul>
              {data.slices.map((s) => (
                <li key={s.key} className="border-b border-[#EEF2F7] last:border-0 dark:border-slate-800">
                  <details className="group">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm">
                      <i className="size-3 shrink-0 rounded-sm" style={{ background: COLOR[s.key] }} aria-hidden />
                      <span className="min-w-0 flex-1 font-semibold">{s.label} <Hint label={`What does ${s.label} mean?`}>{EXPLAIN[s.key]}</Hint></span>
                      <span className="nums text-xs text-slate-500">{s.pct}%</span>
                      <span className="nums w-20 text-right font-semibold sm:w-24">{formatCents(s.cents)}</span>
                    </summary>
                    {s.top.length > 0 && (
                      <ul className="mb-2 ml-5 space-y-0.5 border-l border-[#E2E8F0] pl-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                        {s.top.map((t) => <li key={t.label} className="flex justify-between gap-3"><span className="truncate">{t.label}</span><span className="nums shrink-0">{formatCents(t.cents)}</span></li>)}
                      </ul>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-sm italic text-slate-700 dark:text-slate-200">{data.caption}</p>
          {data.mode === "names" && (
            <p className="mt-2 text-xs text-slate-500">Your Give, Save and Live flow is not set up yet, so this is a gentle guess from your category and pocket names. You can set it up in Flow on the Budget page.</p>
          )}
        </>
      )}
    </section>
  );
}
