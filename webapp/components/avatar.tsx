/* eslint-disable @next/next/no-img-element */
const palette = ["#8ED081", "#7CC4E8", "#F2C75C", "#E8A1C4", "#B7A6F0", "#F0A27B"];
const tint = (s: string) => palette[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];

/** Profile picture, or the person's initial on a colored circle. */
export function Avatar({ name, src, size = 40, className = "" }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  return src ? (
    <img src={src} alt="" width={size} height={size} style={style} className={`shrink-0 rounded-full object-cover ${className}`} />
  ) : (
    <span style={{ ...style, background: tint(name) }} className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-[#1F2E5A] ${className}`} aria-hidden>{initial}</span>
  );
}

export const avatarUrl = (u: { id: string; avatarMime: string | null; updatedAt: Date }) => (u.avatarMime ? `/avatar/${u.id}?v=${u.updatedAt.getTime()}` : null);
