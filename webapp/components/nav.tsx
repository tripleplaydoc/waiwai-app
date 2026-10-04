"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Moon, Sun, LogOut, Wallet, Landmark, Upload, Settings, BarChart3 } from "lucide-react";
import { BrandName } from "@/components/brand";
import { logoutAction } from "@/app/actions/auth";

const LINKS = [
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/import", label: "Import", icon: Upload },
];

function useWs() {
  const params = useSearchParams();
  const ws = params.get("ws") === "business" ? "business" : "personal";
  return { ws, q: (w: string) => (w === "business" ? "?ws=business" : "") };
}

function UserMenu({ initial, name, email }: { initial: string; name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setDark(document.documentElement.classList.contains("dark"));
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.remove("light", "dark");
    root.classList.add(next);
    setDark(next === "dark");
    try { localStorage.setItem("theme", next); } catch { /* private mode: ignore */ }
  }

  const item = "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";
  return (
    <div className="relative" ref={ref}>
      <button
        type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
        className="flex size-10 items-center justify-center rounded-full bg-[#8ED081] text-sm font-bold text-[#1F2E5A] ring-2 ring-white/20 transition hover:ring-white/50"
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 top-full z-50 mt-2 w-64 p-2 text-slate-900 shadow-xl dark:text-slate-100">
          <div className="border-b border-[#E2E8F0] px-3 pb-2 pt-1 dark:border-slate-800">
            <div className="truncate text-sm font-semibold">{name || "Your account"}</div>
            <div className="truncate text-xs text-slate-500 dark:text-slate-400">{email}</div>
          </div>
          <div className="pt-1">
            <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className={item}><Settings className="size-4" aria-hidden /> Settings</Link>
            <button role="menuitem" type="button" onClick={toggleTheme} className={item}>
              {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />} {dark ? "Light mode" : "Dark mode"}
            </button>
            <form action={logoutAction}>
              <button role="menuitem" type="submit" className={item}><LogOut className="size-4" aria-hidden /> Sign out</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function Nav({ initial, name, email }: { initial: string; name: string; email: string }) {
  const pathname = usePathname();
  const { ws, q } = useWs();
  return (
    <header className="sticky top-0 z-30 bg-navy text-white shadow-[0_8px_24px_-14px_rgba(15,26,56,0.6)]">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href={`/budget${q(ws)}`} aria-label="WaiWai home" className="mr-1 shrink-0">
          <BrandName light />
        </Link>
        <nav className="ml-3 hidden items-center gap-1 md:flex" aria-label="Main">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href} href={`${href}${q(ws)}`} aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${active ? "bg-white/15 text-white" : "text-blue-100/75 hover:bg-white/10 hover:text-white"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div role="group" aria-label="Workspace" className="flex rounded-full bg-white/10 p-0.5">
            {(["personal", "business"] as const).map((w) => (
              <Link
                key={w}
                href={`${pathname.startsWith("/accounts/") ? "/accounts" : pathname}${q(w)}`}
                aria-current={ws === w ? "true" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition-colors ${ws === w ? "bg-white text-navy shadow-sm" : "text-blue-100/80 hover:text-white"}`}
              >
                {w}
              </Link>
            ))}
          </div>
          <UserMenu initial={initial} name={name} email={email} />
        </div>
      </div>
    </header>
  );
}

/** Phone-only tab bar. */
export function BottomTabs() {
  const pathname = usePathname();
  const { ws, q } = useWs();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-navy pb-[env(safe-area-inset-bottom)] text-white md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={`${href}${q(ws)}`} aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-white" : "text-blue-100/60"}`}
              >
                <span className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${active ? "bg-white/15" : ""}`}><Icon className="size-5" aria-hidden /></span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
