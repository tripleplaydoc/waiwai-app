"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const KEY = "wai:last-seen";
const AWAY_MS = 20 * 60 * 1000; // coming back after 20 minutes away

/**
 * Opening the app should always land on Home: on a fresh open, after being away a while, or on a new day.
 * (Quick glances at another page, a minute later, are left alone so you never lose your place mid-task.)
 */
export function OpenOnHome() {
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    const today = () => new Date().toDateString();
    const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && typeof v.t === "number" ? v as { t: number; d: string } : null; } catch { return null; } };
    const write = () => { try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d: today() })); } catch { /* private mode */ } };
    const check = () => {
      const last = read();
      if (last && (Date.now() - last.t > AWAY_MS || last.d !== today()) && window.location.pathname !== "/home") router.replace("/home");
      write();
    };
    check();
    const onVis = () => { if (document.visibilityState === "visible") check(); else write(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", write);
    const beat = setInterval(write, 60_000);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", write); clearInterval(beat); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  void path;
  return null;
}
