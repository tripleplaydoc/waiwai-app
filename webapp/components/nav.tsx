"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Moon, Sun, LogOut, Wallet, Landmark, Upload } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";

export function Nav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const ws = params.get("ws") === "business" ? "business" : "personal";
  const q = (w: string) => (w === "business" ? "?ws=business" : "");

  const links = [
    { href: "/budget", label: "Budget", icon: Wallet },
    { href: "/accounts", label: "Accounts", icon: Landmark },
    { href: "/import", label: "Import", icon: Upload },
  ];

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.remove("light", "dark");
    root.classList.add(next);
    try { localStorage.setItem("theme", next); } catch { /* private mode: ignore */ }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-2 sm:px-6">
        <Link href={`/budget${q(ws)}`} className="mr-2 text-base font-semibold tracking-tight">
          Financial Tracker
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={`${href}${q(ws)}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium ${
                  active
                    ? "bg-indigo-50 text-[#4F46E5] dark:bg-indigo-950 dark:text-indigo-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div role="group" aria-label="Workspace" className="flex rounded-xl border border-[#E2E8F0] p-0.5 dark:border-slate-700">
            {(["personal", "business"] as const).map((w) => (
              <Link
                key={w}
                href={`${pathname.startsWith("/accounts/") ? "/accounts" : pathname}${q(w)}`}
                aria-current={ws === w ? "true" : undefined}
                className={`min-h-10 rounded-[10px] px-4 py-2 text-sm font-medium capitalize ${
                  ws === w ? "bg-[#4F46E5] text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {w}
              </Link>
            ))}
          </div>
          <button type="button" onClick={toggleTheme} className="btn size-11 !px-0" aria-label="Toggle dark mode">
            <Sun className="size-4 dark:hidden" aria-hidden />
            <Moon className="hidden size-4 dark:block" aria-hidden />
          </button>
          <form action={logoutAction}>
            <button type="submit" className="btn size-11 !px-0" aria-label="Sign out">
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
