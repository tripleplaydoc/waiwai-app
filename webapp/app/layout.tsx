import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "@fontsource-variable/inter";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Financial Tracker",
  description: "Zero-based budgeting for Personal and Business finances",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

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
        {authed && (
          <Suspense fallback={null}>
            <Nav initial={(user?.name || user?.email || "?").trim().charAt(0).toUpperCase()} />
          </Suspense>
        )}
        {authed ? <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main> : children}
      </body>
    </html>
  );
}
