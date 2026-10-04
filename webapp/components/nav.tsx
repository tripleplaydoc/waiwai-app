"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Moon, Sun, LogOut, Wallet, Landmark, Upload, Settings } from "lucide-react";
import { BrandName } from "@/components/brand";
import { logoutAction } from "@/app/actions/auth";

export function Nav({ initial }: { initial: string }) {
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
    <header className="sticky top-0 z-30 bg-navy text-white shadow-[0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(15,26,56,0.5)]">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-2 sm:px-6">
        <Link href={`/budget${q(ws)}`} className="mr-3" aria-label="Financial Tracker home">
          <BrandName light />
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
                    ? "bg-white/15 text-white"
                    : "text-blue-100/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div role="group" aria-label="Workspace" className="flex rounded-xl border border-white/20 p-0.5">
            {(["personal", "business"] as const).map((w) => (
              <Link
                key={w}
                href={`${pathname.startsWith("/accounts/") ? "/accounts" : pathname}${q(w)}`}
                aria-current={ws === w ? "true" : undefined}
                className={`min-h-10 rounded-[10px] px-3 py-2 text-sm font-medium capitalize sm:px-4 ${
                  ws === w ? "bg-white text-navy" : "text-blue-100/80 hover:bg-white/10"
                }`}
              >
                {w}
              </Link>
            ))}
          </div>
          <button type="button" onClick={toggleTheme} className="btn-nav size-11 !px-0" aria-label="Toggle dark mode">
            <Sun className="size-4 dark:hidden" aria-hidden />
            <Moon className="hidden size-4 dark:block" aria-hidden />
          </button>
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className={`btn-nav size-11 !px-0 ${pathname === "/settings" ? "!bg-white/20" : ""}`}
          >
            <Settings className="size-4" aria-hidden />
          </Link>
          <span aria-hidden className="hidden size-11 items-center sm:flex justify-center rounded-full bg-[#8ED081] text-sm font-bold text-[#1F2E5A]">{initial}</span>
          <form action={logoutAction}>
            <button type="submit" className="btn-nav size-11 !px-0" aria-label="Sign out">
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
