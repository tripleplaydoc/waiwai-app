/** Which Home sections exist, in their default order, and how a saved layout is repaired against them. Pure. */
export const HOME_SECTIONS = [
  { id: "verse", label: "Daily verse" },
  { id: "cash", label: "Cash on hand" },
  { id: "wins", label: "What's going well" },
  { id: "ahead", label: "Looking ahead: 7 days" },
  { id: "steps", label: "Your next steps" },
  { id: "prepare", label: "Prepare for more" },
  { id: "budget", label: "Open the budget board" },
] as const;
export type HomeSectionId = (typeof HOME_SECTIONS)[number]["id"];
export const HOME_IDS: string[] = HOME_SECTIONS.map((s) => s.id);
export const homeLabel = (id: string) => HOME_SECTIONS.find((s) => s.id === id)?.label ?? id;

export interface HomeLayout { order: string[]; hidden: string[] }

/** Saved order first (known ids only, no repeats), then any section added since, in default order. */
export function normalizeLayout(order: unknown, hidden: unknown): HomeLayout {
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...strs(order), ...HOME_IDS]) if (HOME_IDS.includes(id) && !seen.has(id)) { seen.add(id); out.push(id); }
  const hide = [...new Set(strs(hidden).filter((id) => HOME_IDS.includes(id)))];
  return { order: out, hidden: hide };
}

/** Parse the JSON stored in the database; anything unreadable falls back to the default layout. */
export function parseLayout(json: string | null | undefined): HomeLayout {
  try { const v = json ? JSON.parse(json) : null; return normalizeLayout(v?.order, v?.hidden); } catch { return normalizeLayout(null, null); }
}
