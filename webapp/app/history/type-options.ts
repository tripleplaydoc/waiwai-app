import { typeLabel, typesFor } from "@/lib/budget/expense-types";

/** The type choices that make sense for money in or out of this workspace; keeps a row's current type visible even if it is not in the list. */
export function typeOptionsFor(dir: "in" | "out", isBusiness: boolean, current = ""): { key: string; label: string }[] {
  const base = dir === "in" ? typesFor("INCOME") : typesFor("EXPENSE").filter((t) => (t.group === "Business") === isBusiness);
  const list = base.map((t) => ({ key: t.key, label: t.label }));
  if (current && current !== "TRANSFER" && !list.some((o) => o.key === current)) list.unshift({ key: current, label: typeLabel(current) ?? current });
  return list;
}
