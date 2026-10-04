import { BookOpen, Droplets } from "lucide-react";
import { dayNumberFromIso, verseFor } from "@/lib/verses";
import { todayIso } from "@/lib/utils/dates";

/** One verse or saying per day (rotates at local midnight, Hawaiʻi time by default). */
export function DailyVerse() {
  const v = verseFor(dayNumberFromIso(todayIso()));
  return (
    <figure className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0B6E78] via-[#14566F] to-[#1F2E5A] px-5 py-4 text-white shadow-[0_4px_16px_-6px_rgba(15,26,56,0.4)]" aria-label="Today's inspiration">
      <Droplets className="pointer-events-none absolute -right-3 -top-3 size-24 text-white/10" aria-hidden />
      <div className="relative flex items-start gap-3">
        <BookOpen className="mt-1 size-5 shrink-0 text-cyan-200" aria-hidden />
        <div className="min-w-0">
          <blockquote className="text-[15px] font-medium leading-relaxed sm:text-base">“{v.text}”</blockquote>
          <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-cyan-100/90">
            <span className="font-semibold">{v.ref}</span>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">{v.source === "Inspiration" ? "Inspiration" : v.source}</span>
          </figcaption>
        </div>
      </div>
    </figure>
  );
}
