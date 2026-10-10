import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { loadMoveLog } from "@/lib/budget/moves";
import { formatCents } from "@/lib/utils/currency";
import { UndoMoveButton } from "@/components/undo-move-button";
import type { MoveEntry } from "@/lib/budget/moves-math";

export const dynamic = "force-dynamic";

const TZ = process.env.APP_TIMEZONE || "Pacific/Honolulu";
const when = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
const KIND: Record<MoveEntry["kind"], string> = { pocket: "Pocket to pocket", pool: "Back to the pool", transfer: "Bank transfer", rebalance: "Rebalance", heldin: "Held in", fix: "Fix", undo: "Undo" };

export default async function MovesPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";
  let log: MoveEntry[] = [];
  let failed = false;
  try { log = await loadMoveLog(prisma, ws.id, 100); } catch { failed = true; }
  const firstUndoable = log.find((e) => e.canUndo)?.key;

  return (
    <div className="space-y-5">
      <Link href={`/accounts${q}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#2E6BE6] hover:underline dark:text-indigo-300"><ArrowLeft className="size-4" aria-hidden /> Accounts</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Money moves</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Every time money moved: between pockets, back to the pool, between your bank accounts, or when &ldquo;held in&rdquo; labels were changed. Newest first. Undo any move and it is put back exactly as it was; the move stays in this list, marked undone. Everyday budgeting (assigning money, the flow) is not listed here.</p>
      </div>
      {failed ? (
        <div className="card p-5 text-sm">The list could not load. Please try again in a moment.</div>
      ) : log.length === 0 ? (
        <div className="card p-5 text-sm">No moves yet. When you move money between pockets or accounts, it shows up here.</div>
      ) : (
        <ol className="space-y-3">
          {log.map((e) => (
            <li key={e.key} className={`card space-y-2 p-4 ${e.undone || e.kind === "undo" ? "opacity-80" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">{KIND[e.kind]}</span>
                <time className="nums text-slate-500" dateTime={new Date(e.atMs).toISOString()}>{when(e.atMs)}</time>
                {e.key === firstUndoable && <span className="font-semibold text-[#2E6BE6] dark:text-indigo-300">Latest move</span>}
                {e.undone && <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Undone</span>}
              </div>
              <p className={`font-semibold ${e.undone ? "line-through decoration-slate-400" : ""}`}>{e.title}</p>
              {e.lines.length > 0 && (
                <ul className="space-y-0.5 text-sm text-slate-600 dark:text-slate-300">
                  {e.lines.slice(0, 8).map((l, i) => <li key={i} className="nums">{l}</li>)}
                  {e.lines.length > 8 && <li>and {e.lines.length - 8} more</li>}
                </ul>
              )}
              {e.cents > 0 && (e.kind === "rebalance" || e.kind === "heldin" || e.kind === "fix") && <p className="nums text-xs text-slate-500">{formatCents(e.cents)} of labels moved. No pocket amounts changed.</p>}
              {e.canUndo && <UndoMoveButton workspaceId={ws.id} moveKey={e.key} summary={e.title} />}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
