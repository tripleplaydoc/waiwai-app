/** Assets and liabilities: classes, labels and how a plain Account maps onto them. Client-safe (no database). */
export type HoldingKey =
  | "CASH_SAVINGS" | "STOCKS_FUNDS" | "REAL_ESTATE" | "BUSINESS" | "VEHICLE" | "OTHER_ASSET"
  | "MORTGAGE" | "STUDENT_LOAN" | "CAR_LOAN" | "CREDIT_CARD" | "BANK_LOAN" | "OTHER_LIABILITY";

export const HOLDING_DEFS: { key: HoldingKey; label: string; side: "ASSET" | "LIABILITY"; accountType: "INVESTMENT" | "PROPERTY" | "OTHER_ASSET" | "LOAN" | "OTHER_LIABILITY" }[] = [
  { key: "CASH_SAVINGS", label: "Cash & savings", side: "ASSET", accountType: "OTHER_ASSET" },
  { key: "STOCKS_FUNDS", label: "Stocks, funds & retirement", side: "ASSET", accountType: "INVESTMENT" },
  { key: "REAL_ESTATE", label: "Real estate", side: "ASSET", accountType: "PROPERTY" },
  { key: "BUSINESS", label: "Business ownership", side: "ASSET", accountType: "OTHER_ASSET" },
  { key: "VEHICLE", label: "Vehicles", side: "ASSET", accountType: "OTHER_ASSET" },
  { key: "OTHER_ASSET", label: "Other assets", side: "ASSET", accountType: "OTHER_ASSET" },
  { key: "MORTGAGE", label: "Mortgage", side: "LIABILITY", accountType: "LOAN" },
  { key: "STUDENT_LOAN", label: "Student loans", side: "LIABILITY", accountType: "LOAN" },
  { key: "CAR_LOAN", label: "Car loans", side: "LIABILITY", accountType: "LOAN" },
  { key: "CREDIT_CARD", label: "Credit cards", side: "LIABILITY", accountType: "OTHER_LIABILITY" },
  { key: "BANK_LOAN", label: "Other loans", side: "LIABILITY", accountType: "LOAN" },
  { key: "OTHER_LIABILITY", label: "Other liabilities", side: "LIABILITY", accountType: "OTHER_LIABILITY" },
];
const BY_KEY = new Map(HOLDING_DEFS.map((d) => [d.key, d]));
export const holdingLabel = (k: HoldingKey) => BY_KEY.get(k)!.label;
export const holdingSide = (k: HoldingKey) => BY_KEY.get(k)!.side;
export const isHoldingKey = (k: string): k is HoldingKey => BY_KEY.has(k as HoldingKey);

const FROM_TYPE: Record<string, HoldingKey> = {
  CHECKING: "CASH_SAVINGS", SAVINGS: "CASH_SAVINGS", CASH: "CASH_SAVINGS", INVESTMENT: "STOCKS_FUNDS", PROPERTY: "REAL_ESTATE",
  OTHER_ASSET: "OTHER_ASSET", CREDIT_CARD: "CREDIT_CARD", LOAN: "BANK_LOAN", OTHER_LIABILITY: "OTHER_LIABILITY",
};
/** The class an account counts under: the one chosen for it, otherwise derived from its type. */
export const holdingOf = (a: { type: string; holdingClass: string | null }): HoldingKey =>
  a.holdingClass && isHoldingKey(a.holdingClass) ? a.holdingClass : FROM_TYPE[a.type] ?? "OTHER_ASSET";
