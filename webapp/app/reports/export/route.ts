import { getCurrentUser } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { buildPnl } from "@/lib/reports/pnl";
import { resolvePeriod } from "@/lib/reports/periods";
import { todayIso } from "@/lib/utils/dates";
import { centsToInput } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  if (!(await getCurrentUser())) return new Response("Not signed in", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const ws = await getWorkspace(wsKeyFromParam(sp.get("ws") ?? undefined));
  const period = resolvePeriod(sp.get("period") ?? undefined, sp.get("from") ?? undefined, sp.get("to") ?? undefined, todayIso());
  const r = await buildPnl(ws.id, period);
  const lines = [["Section", "Type", "Pocket", "Amount"].join(",")];
  for (const [section, rows] of [["Revenue", r.revenue], ["Expenses", r.expenses]] as const) {
    for (const t of rows) for (const p of t.pockets) lines.push([section, q(t.label), q(p.name), centsToInput(p.cents)].join(","));
  }
  lines.push(["Total", "", "Revenue", centsToInput(r.revenueCents)].join(","), ["Total", "", "Expenses", centsToInput(r.expenseCents)].join(","), ["Total", "", "Net income", centsToInput(r.netCents)].join(","));
  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="waiwai-pnl-${ws.name.toLowerCase()}-${period.from}_${period.to}.csv"` },
  });
}
