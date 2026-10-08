import { Leaf } from "lucide-react";
import { oleloFor } from "@/lib/olelo";
import { todayIso } from "@/lib/utils/dates";

/** One ʻōlelo noʻeau (Hawaiian proverb) per day, with its meaning and a short reflection. Proverbs: see lib/olelo.ts (to be checked by a Hawaiian-language speaker). */
export function DailyOlelo() {
  const o = oleloFor(todayIso());
  return (
    <figure className="rounded-xl border border-[#CFE7EA] bg-[#F1FAFB] px-3 py-2.5 dark:border-teal-900/60 dark:bg-teal-950/30" aria-label="ʻŌlelo noʻeau of the day">
      <figcaption className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-water"><Leaf className="size-3.5" aria-hidden />ʻŌlelo noʻeau of the day</figcaption>
      <p lang="haw" className="mt-1 text-sm font-semibold italic leading-snug text-slate-900 dark:text-slate-100">{o.haw}</p>
      <p className="text-xs leading-snug text-slate-600 dark:text-slate-300">{o.en} <span className="whitespace-nowrap text-slate-500">({o.ref})</span></p>
      <p className="mt-1 text-sm leading-snug text-slate-700 dark:text-slate-200">{o.reflection}</p>
    </figure>
  );
}
