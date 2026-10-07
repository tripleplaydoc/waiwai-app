import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "@fontsource-variable/inter";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { getBudgetView } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { switchBudgetAction } from "@/app/actions/household";
import { BottomTabs, Nav } from "@/components/nav";
import { LiveRefresh } from "@/components/live-refresh";
import { avatarUrl } from "@/components/avatar";
import { QuickAdd } from "@/components/quick-add";
import { AutoPrices } from "@/components/auto-prices";

export const metadata: Metadata = {
  title: "WaiWai",
  appleWebApp: { capable: true, title: "WaiWai", statusBarStyle: "black-translucent" },
  description: "WaiWai — wealth, like water: let it flow with purpose. Zero-based budgeting for Personal and Business.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#1F2E5A" };

// Runs before first paint so the saved theme never flashes. Class names match
// the spec: html.light / html.dark, saved in localStorage.
// "theme" is light (default), dark, or system (follow the device, including when the device switches at sunset).
const themeScript = `(function(){var r=document.documentElement,m='light';try{m=localStorage.getItem('theme')||'light'}catch(e){}var q=window.matchMedia('(prefers-color-scheme: dark)');function a(){var d=m==='dark'||(m==='system'&&q.matches);r.classList.remove('light','dark');r.classList.add(d?'dark':'light')}a();if(m==='system'){q.addEventListener('change',function(){var cur='light';try{cur=localStorage.getItem('theme')||'light'}catch(e){}if(cur==='system')a2()})}function a2(){r.classList.remove('light','dark');r.classList.add(q.matches?'dark':'light')}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  try { user = await getCurrentUser(); } catch { user = null; }
  const authed = user !== null;
  let view = null;
  let privateBudgets: { id: string; name: string }[] = [];
  if (user) {
    try { view = await getBudgetView(); } catch { view = null; }
    if (user.budgetMode !== "PRIVATE") {
      try {
        const rows = await prisma.user.findMany({ where: { budgetMode: "PRIVATE" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true } });
        privateBudgets = rows.map((r) => ({ id: r.id, name: r.name?.trim() || r.email.split("@")[0] }));
      } catch { privateBudgets = []; }
    }
  }
  const viewing = view?.viewingOther ? (view.privateUser?.name?.trim() || view.privateUser?.email.split("@")[0] || "their") : null;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="wai-bg" aria-hidden />
        {authed && (
          <Suspense fallback={null}>
            <Nav initial={(user?.name || user?.email || "?").trim().charAt(0).toUpperCase()} name={user?.name ?? ""} email={user?.email ?? ""} avatar={user ? avatarUrl(user) : null} privateBudgets={privateBudgets} viewingId={view?.viewingOther ? view.privateUser?.id ?? "" : ""} showBusiness={!view?.privateUser || view.privateUser.hasBusiness} />
          </Suspense>
        )}
        {authed ? <main className="mx-auto w-full max-w-6xl px-4 pb-36 pt-6 sm:px-6 md:pb-24 md:pt-8">
          {viewing && (
            <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
              <span>You are viewing <strong>{viewing}&apos;s</strong> private budget. Anything you change here changes their budget.</span>
              <form action={switchBudgetAction}><input type="hidden" name="userId" value="" /><button type="submit" className="btn btn-sm">Back to my budget</button></form>
            </div>
          )}
          {children}</main> : <div className="pt-[env(safe-area-inset-top)]">{children}</div>}
        {authed && (
          <Suspense fallback={null}>
            <BottomTabs />
            <QuickAdd />
            <LiveRefresh />
            <AutoPrices />
          </Suspense>
        )}
      </body>
    </html>
  );
}
