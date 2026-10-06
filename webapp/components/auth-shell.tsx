import { BrandMark, WaveLayer } from "@/components/brand";
import { Layers, ShieldCheck, Keyboard } from "lucide-react";

const points = [
  { icon: Layers, title: "Every dollar has a job", body: "Zero-based pockets keep Personal and Business money organized." },
  { icon: Keyboard, title: "Built for speed", body: "Keyboard-first entry and CSV import from your bank." },
  { icon: ShieldCheck, title: "Private by default", body: "Your data sits behind your own login." },
];

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#0E7C86] via-[#1F2E5A] to-[#0F1A38] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-emerald-400/20 blur-3xl" aria-hidden />
        <WaveLayer />
        <div className="relative flex items-center gap-3">
          <BrandMark className="bg-white/15 shadow-none ring-1 ring-white/25" />
          <span className="text-lg font-semibold tracking-tight">WaiWai</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">Let your wealth flow with purpose.</h2>
          <ul className="mt-10 space-y-6">
            {points.map(({ icon: Icon, title: t, body }) => (
              <li key={t} className="flex gap-4">
                <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{t}</span>
                  <span className="block text-sm text-indigo-100/80">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <p className="max-w-md text-sm leading-relaxed text-blue-100/80">
            <strong className="font-semibold text-white">Waiwai</strong> (“water water”) means <em>wealth</em> in Hawaiian. Where water is plentiful, life prospers — so money here is treated like water: it flows in, is held in pockets, and is directed where it is needed.
          </p>
          <p className="mt-3 text-xs text-blue-100/60">Personal · Business · Net worth</p>
        </div>
      </aside>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <span className="text-lg font-semibold tracking-tight">WaiWai</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          <div className="card mt-8 p-6 sm:p-7">{children}</div>
        </div>
      </section>
    </div>
  );
}
