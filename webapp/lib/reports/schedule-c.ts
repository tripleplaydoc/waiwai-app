/** Where each WaiWai type lands on IRS Schedule C (Form 1040). Guidance only: confirm with your tax professional. */
export const SCHEDULE_C: Record<string, { line: string; label: string }> = {
  ADVERTISING: { line: "8", label: "Advertising" },
  AUTO: { line: "9", label: "Car and truck expenses" },
  BANK_FEES: { line: "10", label: "Commissions and fees" },
  CONTRACT_LABOR: { line: "11", label: "Contract labor" },
  EQUIPMENT: { line: "13", label: "Depreciation and section 179 (equipment)" },
  INSURANCE: { line: "15", label: "Insurance (other than health)" },
  INTEREST: { line: "16b", label: "Interest (other)" },
  PROFESSIONAL: { line: "17", label: "Legal and professional services" },
  OFFICE: { line: "18", label: "Office expense" },
  RENT: { line: "20b", label: "Rent or lease (other business property)" },
  REPAIRS: { line: "21", label: "Repairs and maintenance" },
  SUPPLIES: { line: "22", label: "Supplies" },
  TAXES_LICENSES: { line: "23", label: "Taxes and licenses" },
  TRAVEL: { line: "24a", label: "Travel" },
  MEALS: { line: "24b", label: "Deductible meals (generally 50%)" },
  UTILITIES: { line: "25", label: "Utilities" },
  WAGES: { line: "26", label: "Wages" },
  SOFTWARE: { line: "27a", label: "Other expenses (software and subscriptions)" },
  EDUCATION: { line: "27a", label: "Other expenses (education and training)" },
  OTHER_EXPENSE: { line: "27a", label: "Other expenses" },
};
export const scheduleCFor = (key: string | null) => (key && SCHEDULE_C[key]) || { line: "27a", label: "Other expenses" };
