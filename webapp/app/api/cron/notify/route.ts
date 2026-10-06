import { timingSafeEqual } from "node:crypto";
import { pushConfigured, runReminders } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function allowed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Called once a day by the scheduled function (netlify/functions/daily-reminders.mts). `?dry=1` lists what would be sent without sending. */
export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }

async function handle(req: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) return Response.json({ ok: false, error: "CRON_SECRET is not set." }, { status: 503 });
  if (!allowed(req)) return Response.json({ ok: false, error: "Not allowed." }, { status: 401 });
  if (!pushConfigured()) return Response.json({ ok: false, error: "VAPID keys are not set." }, { status: 503 });
  try {
    const dry = new URL(req.url).searchParams.get("dry") === "1";
    return Response.json({ ok: true, dry, ...(await runReminders({ dry })) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
