import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { ensureWorkspaces } from "@/lib/workspace";
import { loadForecast } from "@/lib/forecast";
import { postDue } from "@/lib/recurring";
import { remindersFor, shortReminder, type Reminder } from "@/lib/push-math";
import { todayIso } from "@/lib/utils/dates";

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let ready = false;
function setup() {
  if (ready) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:reminders@waiwai.app", process.env.VAPID_PUBLIC_KEY as string, process.env.VAPID_PRIVATE_KEY as string);
  ready = true;
}

export interface Payload { title: string; body: string; url: string; tag?: string }

/** Sends to every device a person has turned reminders on for. Dead devices (404/410) are forgotten. Returns how many received it. */
export async function sendToUser(userId: string, payload: Payload): Promise<number> {
  if (!pushConfigured()) return 0;
  setup();
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let ok = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12, urgency: "normal" });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
    }
  }
  return ok;
}

/** Everything worth a reminder right now, across Personal and Business. Also posts repeating items that post themselves. */
export async function collectReminders(today = todayIso()): Promise<Reminder[]> {
  const { personal, business } = await ensureWorkspaces();
  const out: Reminder[] = [];
  for (const [ws, prefix, q] of [[personal, "", ""], [business, "Business: ", "?ws=business"]] as const) {
    try {
      await postDue(ws.id, { onlyAuto: true, today });
      const f = await loadForecast(ws.id, { today, days: 30, wsQ: q });
      const withWs = (r: Reminder): Reminder => ({ ...r, url: q && !r.url.includes("ws=") ? `${r.url}${r.url.includes("?") ? "&" : "?"}ws=business` : r.url });
      out.push(...remindersFor(f.events, today, ws.id, prefix).map(withWs));
      const s = shortReminder(ws.id, prefix, f.firstShort, today);
      if (s) out.push(withWs(s));
    } catch { /* one workspace failing must not stop the other */ }
  }
  return out;
}

/** Daily run: sends each person only the reminders they haven't had yet, as one notification. */
export async function runReminders(opts: { dry?: boolean; today?: string } = {}): Promise<{ users: number; sent: number; reminders: string[] }> {
  const today = opts.today ?? todayIso();
  const all = await collectReminders(today);
  const users = await prisma.pushSubscription.findMany({ distinct: ["userId"], select: { userId: true } });
  let sent = 0;
  const shown: string[] = [];
  for (const { userId } of users) {
    const seen = new Set((await prisma.pushSent.findMany({ where: { userId, key: { in: all.map((r) => r.key) } }, select: { key: true } })).map((r) => r.key));
    const fresh = all.filter((r) => !seen.has(r.key));
    if (fresh.length === 0) continue;
    shown.push(...fresh.map((r) => r.text));
    if (opts.dry) continue;
    const lines = fresh.slice(0, 4).map((r) => r.text);
    if (fresh.length > 4) lines.push(`and ${fresh.length - 4} more`);
    const n = await sendToUser(userId, { title: fresh.length === 1 ? "WaiWai reminder" : `WaiWai: ${fresh.length} reminders`, body: lines.join("\n"), url: fresh.length === 1 ? fresh[0].url : "/budget", tag: "waiwai-reminders" });
    if (n > 0) { sent += n; await prisma.pushSent.createMany({ data: fresh.map((r) => ({ userId, key: r.key })), skipDuplicates: true }); }
  }
  if (!opts.dry) await prisma.pushSent.deleteMany({ where: { sentAt: { lt: new Date(Date.now() - 120 * 86_400_000) } } });
  return { users: users.length, sent, reminders: shown };
}
