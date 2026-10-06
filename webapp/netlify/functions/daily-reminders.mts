// Runs every day at 18:00 UTC (8:00 in Hawaii) and asks the app to send any reminders that are due.
// Needs CRON_SECRET set in the Netlify environment (the same value the app checks).
export default async () => {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) { console.log("daily-reminders: URL or CRON_SECRET is missing"); return; }
  const res = await fetch(`${base}/api/cron/notify`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
  console.log("daily-reminders:", res.status, await res.text());
};

export const config = { schedule: "0 18 * * *" };
