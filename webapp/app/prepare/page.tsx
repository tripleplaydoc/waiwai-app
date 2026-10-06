import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getWorkspace, wsKeyFromParam } from "@/lib/workspace";
import { loadPrepareBase } from "@/lib/prepare";
import { todayIso } from "@/lib/utils/dates";
import { PrepareClient } from "./prepare-client";

export const dynamic = "force-dynamic";

export default async function PreparePage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  await requireAuth();
  const wsKey = wsKeyFromParam((await searchParams).ws);
  const ws = await getWorkspace(wsKey);
  const q = wsKey === "business" ? "?ws=business" : "";
  const base = await loadPrepareBase(ws.id, ws.type === "BUSINESS", todayIso());
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/home${q}`} className="text-sm font-semibold text-blue-700 dark:text-blue-300">← Home</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Prepare for more</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Try out extra money coming in. See whether your plan can hold it, and where it could go to grow the most and leak the least. Nothing here changes your budget.</p>
      </div>
      <PrepareClient base={base} isBusiness={ws.type === "BUSINESS"} wsQuery={q} />
    </div>
  );
}
