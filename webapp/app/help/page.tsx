import Link from "next/link";
import { ArrowRight, Banknote, Building2, Droplets, Landmark, Layers, Repeat, TrendingUp, Wallet } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { wsKeyFromParam } from "@/lib/workspace";
import { WHY_WAIWAI } from "@/lib/why-waiwai";

export const dynamic = "force-dynamic";

function Section({ icon: Icon, title, children, diagram }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode; diagram?: React.ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-bold"><Icon className="size-4 text-water" />{title}</h2>
      <div className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
      {diagram && <div className="mt-3">{diagram}</div>}
    </section>
  );
}

const chip = "rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200";
const arrow = <ArrowRight className="size-4 shrink-0 text-slate-400" aria-hidden />;

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const q = wsKeyFromParam((await searchParams).ws) === "business" ? "?ws=business" : "";
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">How WaiWai works</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">One idea: every dollar gets a job before you spend it. Here is the whole picture in a minute.</p>
      </div>

      <Section icon={Droplets} title="The Pool (Ready to assign)"
        diagram={<div className="flex flex-wrap items-center gap-2"><span className={chip}>Paycheck arrives</span>{arrow}<span className="rounded-lg bg-pos-soft px-2.5 py-1.5 text-xs font-bold text-pos">The Pool</span>{arrow}<span className={chip}>Pockets</span></div>}>
        Money that has arrived but has no job yet waits in the Pool. Your goal is to move it all into pockets so the Pool reads $0.00. A green number means there is money still waiting for a job.
      </Section>

      <Section icon={Wallet} title="Pockets"
        diagram={<div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">{["Groceries", "Rent", "Fun"].map((n) => <div key={n} className="rounded-xl bg-slate-50 px-2 py-3 dark:bg-slate-800/60">{n}</div>)}</div>}>
        A pocket is a job for your money: groceries, rent, a vacation. What you put in a pocket is yours to spend on that thing only. If a pocket runs short, it turns red and you can cover it from another pocket.
      </Section>

      <Section icon={Landmark} title="Held in"
        diagram={<div className="flex items-center gap-2 text-xs"><div className="flex-1 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><div className="font-semibold">Pocket: Rent</div><div className="nums text-slate-500">$1,200</div></div>{arrow}<div className="flex-1 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><div className="font-semibold">Held in: Checking</div><div className="text-slate-500">where the cash sits</div></div></div>}>
        Pockets say what money is for. &quot;Held in&quot; says which bank account the cash is actually sitting in. They are two separate things, and the totals always match.
      </Section>

      <Section icon={Repeat} title="Rebalance">
        Sometimes a pocket says its cash is in one account, but that account has less than it should while another has extra. Rebalance fixes the &quot;Held in&quot; labels so they match reality. It never changes how much is in any pocket.
      </Section>

      <Section icon={Layers} title="Flow: Give, Save, Live"
        diagram={<div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label="Example split: give a little, save some, live on the rest"><div className="w-[10%] bg-[#7C3AED]" /><div className="w-[20%] bg-water" /><div className="flex-1 bg-[#2E6BE6]" /></div>}>
        Flow decides how income splits the moment it arrives: a share to Give, a share to Save, and the rest to Live on. In a business, money flows down Reservoirs: first taxes, then everyday costs, then Reservoir 1 (a cushion of months of costs), then Reservoir 2 and Cash.
      </Section>

      <Section icon={TrendingUp} title="Assets progress bars"
        diagram={<div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full w-[60%] rounded-full bg-water" /></div>}>
        If you are building toward something you own, like gold, a rental or investments, set a goal for what it should be worth. The bar shows what it is worth now compared with the goal. The pocket feeding it only holds what you have set aside to buy more.
      </Section>

      <Section icon={Building2} title="Business tax reserve"
        diagram={<div className="flex flex-wrap items-center gap-2"><span className={chip}>Business income</span>{arrow}<span className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">Tax reserve</span>{arrow}<span className={chip}>Quarterly payment</span></div>}>
        In a Business budget, a share of every sale is set aside for taxes automatically so the money is there when payments are due. Expenses that are tax deductible lower what you need to hold back, and you can release the extra back to the Pool.
      </Section>

      <Section icon={Banknote} title="Your daily routine">
        Add what you spend with the + button. Check Home for the Pool and anything that needs you. Once a week, give any new money a job. That is it.
      </Section>

      <Section icon={Droplets} title="Why WaiWai?">
        {WHY_WAIWAI.map((t) => <p key={t} className="mt-2 first:mt-0">{t}</p>)}
      </Section>

      <div className="flex flex-wrap gap-2">
        <Link href={`/home${q}`} className="btn btn-primary">Back to Home</Link>
        <Link href={`/budget${q}`} className="btn">Open the budget</Link>
      </div>
    </div>
  );
}
