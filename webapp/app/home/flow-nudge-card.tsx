"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Waves } from "lucide-react";
import { NUDGE_SNOOZE_DAYS, dayWord, snoozeUntil } from "@/lib/flow-nudge";

/** A calm note that money has been resting in the Pool. "Maybe later" hides it for 3 days (a cookie, nothing sensitive). */
export function FlowNudgeCard({ amount, days, today, cookieName, href }: { amount: string; days: number; today: string; cookieName: string; href: string }) {
  const router = useRouter();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const later = () => {
    try { document.cookie = `${cookieName}=${snoozeUntil(today)}; path=/; max-age=${(NUDGE_SNOOZE_DAYS + 1) * 86400}; samesite=lax`; } catch { /* ignore */ }
    setGone(true);
    router.refresh();
  };
  return (
    <section className="card border-l-4 !border-l-[#0E7C86] p-4 sm:p-5" aria-label="Let it flow">
      <h2 className="flex items-center gap-2 text-base font-bold"><Waves className="size-4 text-water" aria-hidden />Let it flow</h2>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
        <span className="nums font-semibold">{amount}</span> has been resting in your Pool for {dayWord(days)}. Water that stays still grows stagnant — give it a job.
      </p>
      <p className="mt-1 text-xs text-slate-500">This is not an error and nothing is wrong. It is only a gentle reminder.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={href} className="btn btn-primary min-h-11">Give it a job</Link>
        <button type="button" onClick={later} className="btn min-h-11">Maybe later</button>
      </div>
    </section>
  );
}
