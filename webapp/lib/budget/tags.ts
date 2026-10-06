/** Pocket tags: colours, names and small helpers. Pure and client-safe. */
export const TAG_COLORS = [
  { name: "Indigo", hex: "#4F46E5" }, { name: "Blue", hex: "#2563EB" }, { name: "Teal", hex: "#0D9488" }, { name: "Green", hex: "#16A34A" },
  { name: "Olive", hex: "#65A30D" }, { name: "Gold", hex: "#CA8A04" }, { name: "Orange", hex: "#EA580C" }, { name: "Rose", hex: "#E11D48" },
  { name: "Pink", hex: "#DB2777" }, { name: "Purple", hex: "#7C3AED" }, { name: "Slate", hex: "#64748B" }, { name: "Brown", hex: "#92400E" },
] as const;

/** A starting set you can add with one tap. */
export const SUGGESTED_TAGS = [
  { name: "Fixed", color: "#4F46E5" }, { name: "Variable", color: "#0D9488" }, { name: "Loan", color: "#EA580C" }, { name: "Payroll", color: "#7C3AED" },
] as const;

export interface TagVM { id: string; name: string; color: string }

export const isHexColor = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);
export const normalizeColor = (v: string) => (isHexColor(v) ? v.toUpperCase() : null);

/** Trim, collapse spaces, 1 to 24 characters; null when unusable. */
export function cleanTagName(raw: string): string | null {
  const n = raw.trim().replace(/\s+/g, " ");
  return n.length >= 1 && n.length <= 24 ? n : null;
}

/** Soft background that works on light and dark surfaces: the colour at about 16% strength. */
export const tagBg = (hex: string) => `${hex}29`;

/** Keep only ids that exist, no repeats. */
export function pickKnownIds(ids: string[], known: Set<string>): string[] {
  return [...new Set(ids)].filter((id) => known.has(id));
}
