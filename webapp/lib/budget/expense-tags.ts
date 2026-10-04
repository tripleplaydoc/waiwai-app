/** Spending tags. An expense can carry several. Keep the keys in sync with the ExpenseTag enum in schema.prisma. */
export const EXPENSE_TAGS = ["CULTIVATE", "PRESERVE", "SUPPORT", "REGENERATE", "LEAKAGE"] as const;
export type ExpenseTagKey = (typeof EXPENSE_TAGS)[number];

export const TAG_DEFS: Record<ExpenseTagKey, { label: string; hint: string; chip: string; dot: string }> = {
  CULTIVATE:  { label: "Cultivate",  hint: "Grows income or the business",       chip: "bg-pos-soft text-pos border-pos/30",                              dot: "#059669" },
  PRESERVE:   { label: "Preserve",   hint: "Protects and maintains what you have", chip: "bg-blue-50 text-[#2E6BE6] border-blue-200 dark:bg-blue-950 dark:text-blue-300", dot: "#2563EB" },
  SUPPORT:    { label: "Support",    hint: "Keeps day-to-day operations running", chip: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200", dot: "#64748B" },
  REGENERATE: { label: "Regenerate", hint: "Rest, learning and renewal",          chip: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300", dot: "#7C3AED" },
  LEAKAGE:    { label: "Leakage",    hint: "Waste, drift or regret spending",      chip: "bg-neg-soft text-neg border-neg/30",                              dot: "#DC2626" },
};

export function parseTags(values: unknown[]): ExpenseTagKey[] {
  const set = new Set<ExpenseTagKey>();
  for (const v of values) if (typeof v === "string" && (EXPENSE_TAGS as readonly string[]).includes(v)) set.add(v as ExpenseTagKey);
  return EXPENSE_TAGS.filter((t) => set.has(t));
}
