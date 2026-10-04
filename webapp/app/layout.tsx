import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "@fontsource-variable/inter";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { BottomTabs, Nav } from "@/components/nav";
import { avatarUrl } from "@/components/avatar";
import { QuickAdd } from "@/components/quick-add";

export const metadata: Metadata = {
  title: "WaiWai",
  appleWebApp: { capable: true, title: "WaiWai", statusBarStyle: "black-translucent" },
  description: "WaiWai — wealth, like water: let it flow with purpose. Zero-based budgeting for Personal and Business.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#1F2E5A" };

// Runs before first paint so the saved theme never flashes. Class names match
// the spec: html.light / html.dark, saved in localStorage.
const themeScript = `try{var t=localStorage.getItem('theme');if(t!=='dark')t='light';document.documentElement.classList.add(t)}catch(e){document.documentElement.classList.add('light')}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  try { user = await getCurrentUser(); } catch { user = null; }
  const authed = user !== null;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="wai-bg" aria-hidden />
        {authed && (
          <Suspense fallback={null}>
            <Nav initial={(user?.name || user?.email || "?").trim().charAt(0).toUpperCase()} name={user?.name ?? ""} email={user?.email ?? ""} avatar={user ? avatarUrl(user) : null} />
          </Suspense>
        )}
        {authed ? <main className="mx-auto w-full max-w-6xl px-4 pb-36 pt-6 sm:px-6 md:pb-24 md:pt-8">{children}</main> : <div className="pt-[env(safe-area-inset-top)]">{children}</div>}
        {authed && (
          <Suspense fallback={null}>
            <BottomTabs />
            <QuickAdd />
          </Suspense>
        )}
      </body>
    </html>
  );
}
