/** Plain-words kind of money an account holds, shown next to its name in pickers. */
const KIND: Record<string, string> = { CASH: "cash", CHECKING: "debit", SAVINGS: "savings", CREDIT_CARD: "credit card" };
export const accountKind = (type: string): string | undefined => KIND[type];
