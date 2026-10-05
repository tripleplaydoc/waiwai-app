"use client";
import { useEffect, useState } from "react";

/** Weekly checklist; ticks are remembered per week on this device only. */
export function Checklist({ week, items }: { week: string; items: string[] }) {
  const key = `ww-meeting-${week}`;
  const [done, setDone] = useState<boolean[]>(items.map(() => false));
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(key) ?? "null"); if (Array.isArray(v) && v.length === items.length) setDone(v); } catch {}
  }, [key, items.length]);
  const toggle = (i: number) => setDone((d) => {
    const n = d.map((x, j) => (j === i ? !x : x));
    try { localStorage.setItem(key, JSON.stringify(n)); } catch {}
    return n;
  });
  return (
    <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
      {items.map((t, i) => (
        <li key={t}>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2 text-sm">
            <input type="checkbox" checked={done[i]} onChange={() => toggle(i)} className="size-5 accent-[#4F46E5]" />
            <span className={done[i] ? "text-slate-400 line-through" : ""}>{t}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
