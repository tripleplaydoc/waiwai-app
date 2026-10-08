import Link from "next/link";
import { Sprout } from "lucide-react";
import { Hint } from "@/components/hint";
import { formatCents } from "@/lib/utils/currency";
import { generationsCaption, generationsTotals, type LegacyPocket } from "@/lib/generations";

/** "For the next generation" (Moʻopuna): what is saved across the pockets marked as a long-term gift. */
export function GenerationsCard({ pockets, q }: { pockets: LegacyPocket[]; q: string }) {
  const t = generationsTotals(pockets);
  return (
    <section className="card p-4 sm:p-5" aria-label="For the next generation">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Sprout className="size-4 text-pos" aria-hidden />For the next generation
        <Hint>In Hawaiian, wealth is shared across generations and comes with responsibility to care for it. Mark a pocket &ldquo;For the next generation&rdquo; (in its settings) and it is added up here. There are no forecasts, only what you have set aside so far.</Hint>
      </h2>
      <p className="text-xs text-slate-500">Moʻopuna, those who come after us</p>
      {t.count === 0 ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Nothing set aside for them yet. When you are ready, open a pocket on the <Link href={`/budget${q}`} className="font-semibold text-[#2E6BE6] dark:text-indigo-300">Budget board</Link> and tick &ldquo;For the next generation&rdquo;.
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="nums text-3xl font-bold tracking-tight text-pos">{formatCents(t.savedCents)}</span>
            {t.targetCents > 0 && <span className="nums text-sm text-slate-600 dark:text-slate-300">saved, toward goals of {formatCents(t.targetCents)}</span>}
            {t.targetCents <= 0 && <span className="text-sm text-slate-600 dark:text-slate-300">saved so far</span>}
          </div>
          {t.targetCents > 0 && (
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(t.fraction * 100)} aria-label="Progress toward the goals for the next generation">
              <div className="bar-grow h-full rounded-full bg-pos" style={{ width: `${Math.max(t.fraction > 0 ? 3 : 0, t.fraction * 100)}%` }} />
            </div>
          )}
          <ul className="mt-2">
            {pockets.map((p) => (
              <li key={p.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{p.name}</span>
                <span className="nums shrink-0 font-semibold">{formatCents(p.savedCents)}{p.targetCents ? <span className="font-normal text-slate-500"> of {formatCents(p.targetCents)}</span> : null}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm italic text-slate-700 dark:text-slate-200">{generationsCaption(t)}</p>
        </>
      )}
    </section>
  );
}
