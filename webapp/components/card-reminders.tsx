import Link from "next/link";
import { formatCents } from "@/lib/utils/currency";
import { inDays, shortDate } from "@/lib/cycle";
import type { CardStatus } from "@/lib/budget/cards";

/** Reminders for credit cards: pay down before the statement closes, and the due date. Nothing shows when nothing is close. */
export function CardReminders({ cards, wsQ }: { cards: CardStatus[]; wsQ: string }) {
  const items = cards.flatMap((c) => {
    const out: { key: string; tone: "warn" | "info"; text: string; href: string }[] = [];
    const href = `/accounts/${c.id}${wsQ}`;
    const p = c.plan;
    if (p.closeAlert && c.nextStatement) {
      const when = p.payByDays! <= 0 ? "today" : inDays(p.payByDays!);
      out.push({ key: `close-${c.id}`, tone: "info", href,
        text: `${c.name}: a ${formatCents(p.payDownCents)} payment ${p.payByDays! <= 0 ? "today" : "by " + shortDate(p.payByIso!) + " (" + when + ")"} keeps your credit use${p.reportedPct !== null ? ` near ${p.reportedPct}%` : " low"} when the statement closes ${shortDate(c.nextStatement.iso)}.` });
    }
    if (p.dueAlert && c.nextDue) out.push({ key: `due-${c.id}`, tone: "info", href, text: `${c.name}: your ${formatCents(c.owedCents)} payment is coming up ${inDays(c.nextDue.days)} (${shortDate(c.nextDue.iso)}). Paying on time keeps your streak going.` });
    return out;
  });
  if (items.length === 0) return null;
  return (
    <div className="space-y-2" role="region" aria-label="Credit card reminders">
      {items.map((i) => (
        <Link key={i.key} href={i.href} className={`block rounded-xl border px-3 py-2.5 text-xs font-medium ${i.tone === "warn" ? "border-amber-300 bg-warn-soft text-warn dark:border-amber-700" : "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"}`}>{i.text}</Link>
      ))}
    </div>
  );
}
