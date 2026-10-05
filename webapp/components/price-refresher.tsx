"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { refreshPricesAction } from "@/app/actions/holding-detail";

const EVERY_MS = 10 * 60_000;
// Several refreshers can be mounted at once (the hidden one in the layout and the button); only one fetch runs at a time.
let inflight = false;

/**
 * Keeps coin and share prices current. Refreshes when the screen opens (if the prices are more than 10 minutes old),
 * every 10 minutes while the tab is visible, and on tap of the button.
 */
export function PriceRefresher({ workspaceId, compact, silent }: { workspaceId?: string; compact?: boolean; silent?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const running = useRef(false);

  const run = useCallback(async (manual: boolean) => {
    if (running.current || inflight) return;
    running.current = true; inflight = true; setBusy(true);
    try {
      const r = await refreshPricesAction(workspaceId, manual ? 0 : 10);
      if (silent) return;
      if (manual || !r.ok || (r.message && !/up to date/i.test(r.message))) setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Done." : r.error });
    } catch { setMsg({ ok: false, text: "Couldn't refresh prices. Try again in a moment." }); }
    finally { running.current = false; inflight = false; setBusy(false); }
  }, [workspaceId]);

  useEffect(() => {
    void run(false);
    const t = setInterval(() => { if (document.visibilityState === "visible") void run(false); }, EVERY_MS);
    return () => clearInterval(t);
  }, [run]);

  if (silent) return null;
  return (
    <div className="flex items-center gap-2">
      {msg && <span role="status" className={`text-xs ${msg.ok ? "text-slate-500" : "text-[#C9372C]"}`}>{msg.text}</span>}
      <button type="button" className="btn btn-sm !min-h-10" onClick={() => void run(true)} disabled={busy} aria-label="Refresh prices">
        <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />{!compact && <span>{busy ? "Updating…" : "Refresh prices"}</span>}
      </button>
    </div>
  );
}
