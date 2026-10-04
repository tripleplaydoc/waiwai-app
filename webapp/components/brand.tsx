/** A water drop with a wave through it: "wai" (water), the mark of WaiWai. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#14A3B0] to-[#1F4FB8] text-white shadow-sm shadow-cyan-700/30 ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[20px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.2c3.3 3.9 5.6 6.8 5.6 10a5.6 5.6 0 0 1-11.2 0c0-3.2 2.3-6.1 5.6-10z" />
        <path d="M8.3 14.2c1.1-1 2.2-1 3.7 0s2.6 1 3.7 0" />
      </svg>
    </span>
  );
}

export function BrandName({ light }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark className={light ? "!shadow-none ring-1 ring-white/25" : ""} />
      <span className="text-[17px] font-extrabold tracking-tight">Wai<span className="text-cyan-300">Wai</span></span>
    </span>
  );
}

/** Decorative waves for dark hero panels. */
export function WaveLayer() {
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 w-full opacity-30" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden>
      <path fill="#35B6C2" fillOpacity=".35" d="M0 224l60-26.7C120 171 240 117 360 122.7c120 5.3 240 69.3 360 80s240-32 360-58.7 240-37.3 300-42.6l60-5.4V320H0z" />
      <path fill="#fff" fillOpacity=".12" d="M0 256l60-21.3C120 213 240 171 360 170.7c120 .3 240 42.3 360 58.6s240-5.3 360-32 240-58.7 300-72l60-13.3V320H0z" />
    </svg>
  );
}
