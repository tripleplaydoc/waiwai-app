import Link from "next/link";
import { CalendarCheck, Droplets, Landmark, Sprout, Waypoints, Percent } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { wsKeyFromParam } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function CoachHub({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const q = wsKey === "business" ? "?ws=business" : "";
  const items = [
    { href: "/coach/meeting", title: "Money Meeting", text: "Ten minutes a week: assign, cover, review, decide.", icon: CalendarCheck },
    { href: "/coach/leaks", title: "Leak finder", text: "Subscriptions, price creep, double charges.", icon: Droplets },
    { href: "/coach/flow", title: "Where every $100 went", text: "See the path your income took.", icon: Waypoints },
    { href: "/coach/growth", title: "Growth numbers", text: "Savings rate, runway, freedom number.", icon: Sprout },
    ...(wsKey === "business" ? [{ href: "/coach/tax", title: "Tax levers", text: "Quarterly dates, projection, savings levers.", icon: Percent }] : []),
    { href: "/holdings/payoff", title: "Debt payoff planner", text: "Which debt to pay first and how fast.", icon: Landmark },
  ];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coach</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Tools to understand how your money moves and direct it on purpose.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map(({ href, title, text, icon: Icon }) => (
          <li key={href}>
            <Link href={`${href}${q}`} className="card flex min-h-20 items-start gap-3 p-4 hover:border-[#4F46E5]">
              <Icon className="mt-0.5 size-5 shrink-0 text-[#4F46E5]" aria-hidden />
              <span><span className="block font-semibold">{title}</span><span className="block text-sm text-slate-600 dark:text-slate-300">{text}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
