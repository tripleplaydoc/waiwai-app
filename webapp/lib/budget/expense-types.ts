/**
 * WaiWai "type" for a pocket: what kind of expense (or income) it is.
 * Stored as a plain key on Category.expenseType so the list can grow without
 * a database migration. Business keys line up with IRS Schedule C lines.
 */
export type TypeKind = "EXPENSE" | "INCOME";
export interface TypeDef { key: string; label: string; kind: TypeKind; group: "Business" | "Personal" | "Income" }

export const OWNER_DRAW = "OWNER_DRAW";
/** Types where part of the cost is often personal (home office, phone, car...). */
export const MIXED_USE_TYPES = ["UTILITIES", "AUTO", "RENT", "EQUIPMENT", "INSURANCE", "SOFTWARE"];
/** Share of a cost that is deductible for tax, in basis points (meals are generally 50%). */
export const deductibleShareBps = (type: string | null | undefined) => (type === "MEALS" ? 5000 : 10000);

export const TYPE_DEFS: TypeDef[] = [
  // Business expenses (Schedule C style)
  { key: "ADVERTISING", label: "Advertising", kind: "EXPENSE", group: "Business" },
  { key: "AUTO", label: "Auto expense", kind: "EXPENSE", group: "Business" },
  { key: "BANK_FEES", label: "Bank & processing fees", kind: "EXPENSE", group: "Business" },
  { key: "CONTRACT_LABOR", label: "Contract labor", kind: "EXPENSE", group: "Business" },
  { key: "EDUCATION", label: "Education & training", kind: "EXPENSE", group: "Business" },
  { key: "EQUIPMENT", label: "Equipment", kind: "EXPENSE", group: "Business" },
  { key: "INSURANCE", label: "Insurance", kind: "EXPENSE", group: "Business" },
  { key: "INTEREST", label: "Interest", kind: "EXPENSE", group: "Business" },
  { key: "MEALS", label: "Meals", kind: "EXPENSE", group: "Business" },
  { key: "OFFICE", label: "Office expense", kind: "EXPENSE", group: "Business" },
  { key: "PROFESSIONAL", label: "Legal & professional", kind: "EXPENSE", group: "Business" },
  { key: "RENT", label: "Rent or lease", kind: "EXPENSE", group: "Business" },
  { key: "REPAIRS", label: "Repairs & maintenance", kind: "EXPENSE", group: "Business" },
  { key: "SOFTWARE", label: "Software & subscriptions", kind: "EXPENSE", group: "Business" },
  { key: "SUPPLIES", label: "Supplies", kind: "EXPENSE", group: "Business" },
  { key: "TAXES_LICENSES", label: "Taxes & licenses", kind: "EXPENSE", group: "Business" },
  { key: "TRAVEL", label: "Travel", kind: "EXPENSE", group: "Business" },
  { key: "UTILITIES", label: "Utilities", kind: "EXPENSE", group: "Business" },
  { key: "WAGES", label: "Wages", kind: "EXPENSE", group: "Business" },
  { key: "OTHER_EXPENSE", label: "Other expense", kind: "EXPENSE", group: "Business" },
  // Personal / everyday
  { key: "HOUSING", label: "Housing", kind: "EXPENSE", group: "Personal" },
  { key: "FOOD", label: "Groceries", kind: "EXPENSE", group: "Personal" },
  { key: "DINING", label: "Dining out", kind: "EXPENSE", group: "Personal" },
  { key: "TRANSPORT", label: "Transportation", kind: "EXPENSE", group: "Personal" },
  { key: "HEALTH", label: "Health", kind: "EXPENSE", group: "Personal" },
  { key: "CHILDREN", label: "Children & family", kind: "EXPENSE", group: "Personal" },
  { key: "CLOTHING", label: "Clothing", kind: "EXPENSE", group: "Personal" },
  { key: "ENTERTAINMENT", label: "Entertainment", kind: "EXPENSE", group: "Personal" },
  { key: "GIVING", label: "Giving & tithing", kind: "EXPENSE", group: "Personal" },
  { key: "DEBT", label: "Debt payment", kind: "EXPENSE", group: "Personal" },
  { key: "SAVINGS", label: "Savings & investing", kind: "EXPENSE", group: "Personal" },
  /** The personal share of a mixed-use purchase. Not a business expense, so the P&L leaves it out. */
  { key: OWNER_DRAW, label: "Owner\u2019s draw (personal use)", kind: "EXPENSE", group: "Personal" },
  // Income
  { key: "SALES", label: "Sales / revenue", kind: "INCOME", group: "Income" },
  { key: "SERVICES", label: "Service income", kind: "INCOME", group: "Income" },
  { key: "PAYCHECK", label: "Paycheck / wages", kind: "INCOME", group: "Income" },
  { key: "INTEREST_INCOME", label: "Interest & dividends", kind: "INCOME", group: "Income" },
  { key: "REFUND", label: "Refunds & reimbursements", kind: "INCOME", group: "Income" },
  { key: "OTHER_INCOME", label: "Other income", kind: "INCOME", group: "Income" },
];

const BY_KEY = new Map(TYPE_DEFS.map((t) => [t.key, t]));
/** Custom types are stored as "CUSTOM:<name>" so they need no database changes. */
export const CUSTOM_PREFIX = "CUSTOM:";
export const customKey = (name: string) => CUSTOM_PREFIX + name.trim().replace(/\s+/g, " ").slice(0, 40);
export const isCustomKey = (k: string) => k.startsWith(CUSTOM_PREFIX) && k.length > CUSTOM_PREFIX.length;
export const isTypeKey = (k: string) => BY_KEY.has(k) || isCustomKey(k);
export const typeLabel = (key: string | null | undefined) => (key ? (isCustomKey(key) ? key.slice(CUSTOM_PREFIX.length) : BY_KEY.get(key)?.label ?? null) : null);
export const typesFor = (kind: TypeKind) => TYPE_DEFS.filter((t) => t.kind === kind);

/** Older Schedule C tags map onto the new keys so existing business pockets are already classified. */
const SCHEDULE_C: Record<string, string> = {
  ADVERTISING: "ADVERTISING", CAR_AND_TRUCK: "AUTO", COMMISSIONS_AND_FEES: "BANK_FEES", CONTRACT_LABOR: "CONTRACT_LABOR",
  INSURANCE: "INSURANCE", INTEREST: "INTEREST", LEGAL_AND_PROFESSIONAL: "PROFESSIONAL", OFFICE_EXPENSE: "OFFICE",
  RENT_OR_LEASE: "RENT", REPAIRS_AND_MAINTENANCE: "REPAIRS", SUPPLIES: "SUPPLIES", TAXES_AND_LICENSES: "TAXES_LICENSES",
  TRAVEL: "TRAVEL", MEALS: "MEALS", UTILITIES: "UTILITIES", WAGES: "WAGES", SOFTWARE_AND_SUBSCRIPTIONS: "SOFTWARE", OTHER: "OTHER_EXPENSE",
};

export function effectiveType(c: { expenseType: string | null; scheduleCLineItem: string | null }): string | null {
  if (c.expenseType && (BY_KEY.has(c.expenseType) || isCustomKey(c.expenseType))) return c.expenseType;
  return c.scheduleCLineItem ? SCHEDULE_C[c.scheduleCLineItem] ?? null : null;
}
