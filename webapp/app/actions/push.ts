"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
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
  const n = await sendToUser(me.id, { title: "WaiWai reminders are on", body: "One calm note each morning, with something good first.", url: "/budget", tag: "waiwai-test" }).catch(() => 0);
  return n > 0 ? { ok: true, message: `Sent to ${n} device${n === 1 ? "" : "s"}.` } : { ok: false, error: "Nothing could be delivered. Turn reminders off and on again on this device." };
}

/** Quiet mode: days = 0 resumes reminders. */
export async function setQuietModeAction(days: number): Promise<ActionResult> {
  await assertAuthed();
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (![0, 1, 3, 7].includes(days)) return { ok: false, error: "Pick 1 day, 3 days, 1 week or resume." };
  const pausedUntil = days === 0 ? null : new Date(Date.now() + days * 86_400_000);
  try {
    await prisma.pushPref.upsert({ where: { userId: me.id }, update: { pausedUntil }, create: { userId: me.id, pausedUntil } });
  } catch {
    return { ok: false, error: "Quiet mode needs the new database table first (push_quiet_mode SQL)." };
  }
  revalidatePath("/settings");
  return { ok: true, message: days === 0 ? "Reminders are back on." : `Quiet until ${pausedUntil!.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` };
}
