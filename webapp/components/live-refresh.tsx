"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const EVERY_MS = 8000;

/**
 * Keeps an open screen up to date when someone else changes the budget.
 * Asks /pulse for a fingerprint every few seconds (only while the tab is visible) and refreshes
 * the page's data when it changes. It never refreshes while a dialog is open or you're typing in a field,
 * so it can't wipe out something half-entered — it waits and tries again.
 */
export function LiveRefresh() {
  const router = useRouter();
  const last = useRef<string | null>(null);
  const stale = useRef(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const busy = () => {
      if (document.querySelector('[aria-modal="true"]')) return true;
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };

    async function tick() {
      if (stopped) return;
      let next = EVERY_MS;
      if (document.visibilityState === "visible") {
        try {
          if (!stale.current) {
            const res = await fetch("/pulse", { cache: "no-store" });
            if (res.ok) {
              const { v } = (await res.json()) as { v: string };
              if (last.current !== null && v !== last.current) stale.current = true;
              last.current = v;
            }
          }
          if (stale.current) {
            if (busy()) next = 2000; // wait until the dialog closes / the field loses focus
            else { stale.current = false; router.refresh(); }
          }
        } catch { /* offline: try again next time */ }
      }
      timer = setTimeout(tick, next);
    }

    const wake = () => { if (document.visibilityState === "visible") { clearTimeout(timer); void tick(); } };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    void tick();
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); };
  }, [router]);

  return null;
}
