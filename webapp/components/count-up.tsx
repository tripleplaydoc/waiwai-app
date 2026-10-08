"use client";

import { useEffect, useRef, useState } from "react";
import { formatCents } from "@/lib/utils/currency";

/** A money amount that flows up (or down) to its value instead of jumping. Shows the final value at once if motion is reduced. */
export function CountUp({ cents, ms = 700 }: { cents: number; ms?: number }) {
  const [shown, setShown] = useState(cents);
  const from = useRef(cents);
  const first = useRef(true);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = first.current ? 0 : from.current;
    first.current = false;
    if (reduce || start === cents) { setShown(cents); from.current = cents; return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(start + (cents - start) * eased);
      setShown(v); from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cents, ms]);
  return <span suppressHydrationWarning>{formatCents(shown)}</span>;
}
