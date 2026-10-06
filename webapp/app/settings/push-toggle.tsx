"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "@/app/actions/push";

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

/** Turns reminders on or off for this phone / computer. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!ok) return setState(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        setState((await reg.pushManager.getSubscription()) ? "on" : "off");
      } catch { setState("unsupported"); }
    })();
  }, []);

  function turnOn() {
    setMsg(null);
    start(async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey as string) }));
        const res = await savePushSubscriptionAction(sub.toJSON(), navigator.userAgent);
        if (!res.ok) { setMsg({ ok: false, text: res.error ?? "Could not save." }); await sub.unsubscribe().catch(() => {}); return; }
        setState("on");
        setMsg({ ok: true, text: "Reminders are on for this device." });
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not turn reminders on." });
      }
    });
  }

  function turnOff() {
    setMsg(null);
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await removePushSubscriptionAction(sub.endpoint); await sub.unsubscribe().catch(() => {}); }
      setState("off");
    });
  }

  function test() {
    setMsg(null);
    start(async () => { const r = await sendTestPushAction(); setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Sent." : r.error ?? "Failed." }); });
  }

  if (!publicKey) return <p className="rounded-xl border border-amber-300 bg-warn-soft px-4 py-3 text-sm text-warn dark:border-amber-700">Reminders aren&apos;t set up on the server yet. Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and CRON_SECRET in Netlify (see the README), redeploy, then come back.</p>;
  if (state === "loading") return <p className="text-sm text-slate-500">Checking this device…</p>;
  if (state === "ios-install") return <p className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">On iPhone, reminders only work once WaiWai is on your Home Screen: open it in Safari, tap Share, then Add to Home Screen. Open WaiWai from that icon and come back to this page.</p>;
  if (state === "unsupported") return <p className="text-sm text-slate-600 dark:text-slate-300">This browser can&apos;t receive reminders. Try Chrome, Edge, Firefox or Safari 16.4+ (installed to the Home Screen on iPhone).</p>;
  if (state === "denied") return <p className="text-sm text-slate-600 dark:text-slate-300">Notifications are blocked for WaiWai on this device. Allow them in the browser or phone settings for this site, then reload this page.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {state === "on" ? (
          <>
            <span className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-pos-soft px-4 text-sm font-semibold text-pos"><Bell className="size-4" aria-hidden />On for this device</span>
            <button type="button" onClick={test} disabled={pending} className="btn">Send a test</button>
            <button type="button" onClick={turnOff} disabled={pending} className="btn"><BellOff className="size-4" aria-hidden />Turn off</button>
          </>
        ) : (
          <button type="button" onClick={turnOn} disabled={pending} className="btn btn-primary"><Bell className="size-4" aria-hidden />{pending ? "Turning on…" : "Turn on reminders"}</button>
        )}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-pos" : "text-neg"}`}>{msg.text}</p>}
    </div>
  );
}
