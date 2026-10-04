import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { buildPnl } from "@/lib/reports/pnl";
import { resolvePeriod } from "@/lib/reports/periods";
import { fullCsv, qboBankCsv, scheduleCCsv } from "@/lib/reports/exports";
import { csvResponse, row, text } from "@/lib/reports/csv";
import { todayIso } from "@/lib/utils/dates";
import { centsToInput } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await getCurrentUser())) return new Response("Not signed in", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const ws = await getWorkspace(wsKeyFromParam(sp.get("ws") ?? undefined));
  const period = resolvePeriod(sp.get("period") ?? undefined, sp.get("from") ?? undefined, sp.get("to") ?? undefined, todayIso());
  const kind = sp.get("kind") ?? "pnl";
  const base = `waiwai-${ws.name.toLowerCase()}`;
  const span = `${period.from}_to_${period.to}`;

  if (kind === "qbo") {
    const account = await prisma.account.findFirst({ where: { id: sp.get("account") ?? "", workspaceId: ws.id } });
    if (!account) return new Response("Pick an account for the QuickBooks file.", { status: 400 });
    const { lines } = await qboBankCsv(ws.id, account.id, period.from, period.to);
    return csvResponse(lines, `${base}-quickbooks-${account.name.toLowerCase()}-${span}.csv`);
  }
  if (kind === "transactions") {
    const accountId = sp.get("account");
    const account = accountId ? await prisma.account.findFirst({ where: { id: accountId, workspaceId: ws.id } }) : null;
    const { lines } = await fullCsv(ws.id, account?.id ?? null, period.from, period.to);
    return csvResponse(lines, `${base}-transactions-${span}.csv`);
  }
  if (kind === "schedulec") {
    const { lines } = await scheduleCCsv(ws.id, period.from, period.to);
    return csvResponse(lines, `${base}-schedule-c-${span}.csv`);
  }

  const r = await buildPnl(ws.id, period);
  const lines = [row(["Section", "Type", "Pocket", "Amount"])];
  for (const [section, rows] of [["Revenue", r.revenue], ["Expenses", r.expenses]] as const) {
    for (const t of rows) for (const p of t.pockets) lines.push(row([section, text(t.label), text(p.name), centsToInput(p.cents)]));
  }
  lines.push(row(["Total", "", "Revenue", centsToInput(r.revenueCents)]), row(["Total", "", "Expenses", centsToInput(r.expenseCents)]), row(["Total", "", "Net income", centsToInput(r.netCents)]));
  return csvResponse(lines, `${base}-pnl-${span}.csv`);
}
