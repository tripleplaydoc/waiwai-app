import { getCurrentUser } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { historyReady, loadHistory } from "@/lib/history";
import { scheduleCFor } from "@/lib/reports/schedule-c";
import { csvResponse, row, text } from "@/lib/reports/csv";
import { deductibleAmount, isDeductibleType } from "@/lib/history-math";
import { centsToInput } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

/** Every year, by Schedule C line: history, typed-in totals and the live budget together. Guidance for your preparer, not tax advice. */
export async function GET(req: Request) {
  if (!(await getCurrentUser())) return new Response("Not signed in", { status: 401 });
  const ws = await getWorkspace(wsKeyFromParam(new URL(req.url).searchParams.get("ws") ?? undefined));
  if (!(await historyReady())) return new Response("Run the History migration first.", { status: 400 });
  const biz = ws.type === "BUSINESS";
  const vm = await loadHistory(ws.id, biz);
  const lines = [row(["Year", "Section", "Schedule C line", "Description", "Amount", "Deductible amount"])];
  for (const y of [...vm.years].sort((a, b) => a.year - b.year)) {
    for (const r of y.revenue) lines.push(row([y.year, "Income", biz ? "1" : "", text(r.label), centsToInput(r.cents), ""]));
    for (const r of y.expenses) {
      const sc = scheduleCFor(r.key === "UNCLASSIFIED" ? null : r.key);
      const ded = isDeductibleType(r.key, biz) ? deductibleAmount(r.cents, r.key) : 0;
      lines.push(row([y.year, "Expense", biz ? sc.line : "", text(biz ? sc.label : r.label), centsToInput(r.cents), centsToInput(ded)]));
    }
    lines.push(row([y.year, "Total", "", "Profit", centsToInput(y.netCents), ""]));
  }
  return csvResponse(lines, `waiwai-${ws.name.toLowerCase()}-history-by-year.csv`);
}
