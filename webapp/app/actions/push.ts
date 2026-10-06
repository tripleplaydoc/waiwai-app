"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed, getCurrentUser } from "@/lib/auth";
import { pushConfigured, sendToUser } from "@/lib/push";
import type { ActionResult } from "./types";

const sub = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(10).max(100) }),
});

/** Remembers this phone / computer so the daily run can send to it. */
export async function savePushSubscriptionAction(input: unknown, userAgent: string): Promise<ActionResult> {
  await assertAuthed();
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const p = sub.safeParse(input);
  if (!p.success) return { ok: false, error: "This device sent an unreadable permission. Try again." };
  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint: p.data.endpoint },
      update: { userId: me.id, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, userAgent: userAgent.slice(0, 300), lastSeenAt: new Date() },
      create: { userId: me.id, endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, userAgent: userAgent.slice(0, 300) },
    });
  } catch {
    return { ok: false, error: "Reminders need the new database table first. Run the push_reminders SQL in Supabase, then try again." };
  }
  return { ok: true };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  await assertAuthed();
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: me.id } }).catch(() => {});
  return { ok: true };
}

export async function sendTestPushAction(): Promise<ActionResult> {
  await assertAuthed();
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (!pushConfigured()) return { ok: false, error: "The server has no push keys yet (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)." };
  const n = await sendToUser(me.id, { title: "WaiWai reminders are on", body: "You'll get a nudge before card payments, bills and loan payments are due.", url: "/budget", tag: "waiwai-test" }).catch(() => 0);
  return n > 0 ? { ok: true, message: `Sent to ${n} device${n === 1 ? "" : "s"}.` } : { ok: false, error: "Nothing could be delivered. Turn reminders off and on again on this device." };
}
