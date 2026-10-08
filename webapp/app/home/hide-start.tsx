"use client";

import { useRouter } from "next/navigation";

/** Hides the first-run card for this budget. Remembered in a cookie (nothing sensitive). */
export function HideStart({ cookieName }: { cookieName: string }) {
  const router = useRouter();
  const hide = () => {
    try { document.cookie = `${cookieName}=1; path=/; max-age=31536000; samesite=lax`; } catch { /* ignore */ }
    router.refresh();
  };
  return <button type="button" onClick={hide} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">Hide</button>;
}
