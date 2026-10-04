import { BookOpen } from "lucide-react";
import { dayNumberFromIso, verseFor } from "@/lib/verses";
import { todayIso } from "@/lib/utils/dates";

/** One verse or saying per day (rotates at local midnight, Hawaiʻi time by default). */
export function DailyVerse() {
  const v = verseFor(dayNumberFromIso(todayIso()));
  return (
    <figure className="flex items-start gap-3 rounded-xl bg-gradient-to-r from-[#0B6E78] via-[#14566F] to-[#1F2E5A] px-3 py-1.5 text-white shadow-[0_4px_16px_-6px_rgba(15,26,56,0.4)]" aria-label="Today's inspiration">
      <BookOpen className="mt-0.5 size-4 shrink-0 text-cyan-200" aria-hidden />
      <p className="min-w-0 text-[13px] leading-snug sm:text-sm">
        <span className="font-medium">“{v.text}”</span>{" "}
        <span className="whitespace-nowrap text-xs text-cyan-100/90">— {v.ref}</span>
      </p>
    </figure>
  );
}
