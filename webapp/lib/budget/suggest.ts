/**
 * Pocket suggestions for a typed expense. Pure (no database): the server action feeds it the pocket list and the history.
 * Order of trust: what this user did with the same payee before, then built-in vendor/keyword rules matched to their pockets,
 * then a pocket whose own name appears in the text.
 */
import { TYPE_DEFS, typeLabel } from "./expense-types";

export interface SuggestPocket { id: string; name: string; group: string; expenseType: string | null; isTaxDeductible: boolean; isSystemManaged: boolean }
/** How often a pocket got money from payees matching the text: `exact` = same payee name, otherwise just contains it. */
export interface HistoryHit { categoryId: string; count: number; exact: boolean; payee: string }

export interface Suggestion {
  categoryId: string;
  name: string;
  group: string;
  source: "history" | "rule" | "name";
  /** One plain line saying why. */
  reason: string;
  /** True when this kind of pocket is a business expense you can deduct. */
  deductible: boolean;
  typeLabel: string | null;
  score: number;
}
export interface RuleHint { typeKey: string; label: string; /** The user has no pocket of this type yet. */ missing: boolean }
export interface SuggestResult { suggestions: Suggestion[]; hint: RuleHint | null }

/** Keyword -> expense type. Longer / more specific phrases first matter little: the best (longest) match wins. */
const RULES: { type: string; words: string[] }[] = [
  { type: "SOFTWARE", words: ["zoom", "adobe", "canva", "notion", "slack", "github", "openai", "anthropic", "claude", "chatgpt", "google workspace", "gsuite", "dropbox", "squarespace", "wix", "shopify", "quickbooks", "intuit", "mailchimp", "convertkit", "kajabi", "circle.so", "circle", "manychat", "calendly", "descript", "vidiq", "zapier", "netlify", "vercel", "supabase", "godaddy", "namecheap", "subscription", "saas", "icloud", "microsoft 365", "office 365", "lastpass", "1password", "loom", "riverside", "otter"] },
  { type: "ADVERTISING", words: ["facebook ads", "meta ads", "google ads", "instagram ads", "tiktok ads", "youtube ads", "linkedin ads", "advertising", "ad spend", "sponsored", "boost post", "promo", "billboard", "flyer", "vistaprint", "business cards"] },
  { type: "TRAVEL", words: ["delta", "united", "alaska air", "alaska airlines", "hawaiian air", "hawaiian airlines", "southwest", "jetblue", "american airlines", "airline", "airfare", "flight", "airbnb", "vrbo", "hotel", "marriott", "hilton", "hyatt", "expedia", "priceline", "hotels.com", "kayak", "booking.com", "rental car", "hertz", "avis", "enterprise rent", "turo", "amtrak", "lodging", "resort"] },
  { type: "MEALS", words: ["restaurant", "cafe", "coffee", "starbucks", "doordash", "ubereats", "uber eats", "grubhub", "lunch", "dinner", "breakfast", "catering", "bar & grill", "grill", "bistro", "pizza", "sushi", "taco"] },
  { type: "OFFICE", words: ["staples", "office depot", "officemax", "usps", "fedex", "ups store", "postage", "stamps", "shipping", "printer ink", "paper", "pens", "mailbox", "po box", "coworking", "wework"] },
  { type: "SUPPLIES", words: ["supplies", "supply", "amazon", "costco business", "uline", "home depot", "lowes", "walmart business", "gloves", "bottles", "packaging", "wholesale", "fullscript", "emerson", "vitacost"] },
  { type: "UTILITIES", words: ["verizon", "at&t", "t-mobile", "comcast", "spectrum", "xfinity", "hawaiian telcom", "internet", "phone bill", "wireless", "hawaiian electric", "heco", "electric", "water bill", "gas company", "utility", "utilities", "starlink"] },
  { type: "INSURANCE", words: ["insurance", "geico", "state farm", "allstate", "progressive", "liability", "malpractice", "hiscox", "next insurance", "premium"] },
  { type: "PROFESSIONAL", words: ["attorney", "lawyer", "law firm", "legalzoom", "legal zoom", "cpa", "accountant", "accounting", "bookkeeper", "bookkeeping", "tax prep", "turbotax", "consultant", "coach fee", "notary"] },
  { type: "BANK_FEES", words: ["stripe", "paypal", "square", "merchant", "processing fee", "bank fee", "monthly fee", "wire fee", "service fee", "overdraft", "atm fee", "affirm fee", "late fee"] },
  { type: "EDUCATION", words: ["udemy", "coursera", "masterclass", "conference", "seminar", "workshop", "webinar", "ceu", "continuing education", "tuition", "training", "course", "certification", "membership dues", "association"] },
  { type: "AUTO", words: ["shell", "chevron", "76 gas", "arco", "gas station", "fuel", "gasoline", "parking", "toll", "car wash", "oil change", "tires", "mileage", "auto repair", "jiffy"] },
  { type: "EQUIPMENT", words: ["apple store", "best buy", "b&h", "adorama", "macbook", "laptop", "computer", "monitor", "camera", "microphone", "lens", "ipad", "iphone", "equipment", "furniture", "standing desk", "tripod", "lighting"] },
  { type: "REPAIRS", words: ["repair", "maintenance", "plumber", "electrician", "handyman", "hvac", "service call"] },
  { type: "CONTRACT_LABOR", words: ["upwork", "fiverr", "freelancer", "contractor", "virtual assistant", "editor", "designer", "videographer", "transcription", "ghostwriter", "1099"] },
  { type: "RENT", words: ["rent", "lease", "office space", "studio rental", "storage unit", "public storage"] },
  { type: "TAXES_LICENSES", words: ["license", "licence", "permit", "business registration", "annual report", "secretary of state", "dcca", "get tax", "state tax", "property tax", "dmv", "board fee", "renewal"] },
  { type: "WAGES", words: ["payroll", "gusto", "adp", "wages", "salary", "paycheck for"] },
  // personal / everyday
  { type: "FOOD", words: ["safeway", "foodland", "costco", "walmart", "target", "whole foods", "trader joe", "kroger", "grocery", "groceries", "times supermarket", "don quijote", "longs", "cvs"] },
  { type: "DINING", words: ["mcdonald", "burger", "chick-fil-a", "chipotle", "ramen", "poke", "takeout", "take out", "food truck"] },
  { type: "TRANSPORT", words: ["uber", "lyft", "bus pass", "thebus", "car payment", "registration"] },
  { type: "HEALTH", words: ["pharmacy", "walgreens", "doctor", "dentist", "clinic", "hospital", "copay", "vision", "optometrist", "prescription"] },
  { type: "ENTERTAINMENT", words: ["netflix", "hulu", "disney", "spotify", "movie", "theater", "concert", "steam", "playstation", "xbox", "hbo", "youtube premium"] },
  { type: "CLOTHING", words: ["nike", "old navy", "uniqlo", "zara", "nordstrom", "clothing", "shoes", "apparel"] },
  { type: "GIVING", words: ["donation", "tithe", "tithing", "offering", "charity", "gofundme", "church"] },
  { type: "CHILDREN", words: ["daycare", "preschool", "school fee", "toys", "diapers", "baby", "childcare"] },
];

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9&.+ ]+/g, " ").replace(/\s+/g, " ").trim()} `;
const TYPE_BY_KEY = new Map(TYPE_DEFS.map((t) => [t.key, t]));
const isBusinessType = (key: string | null) => (key ? TYPE_BY_KEY.get(key)?.group === "Business" : false);

/** The best rule type for the text: the longest matching keyword wins (so "google ads" beats "google"). Whole-word match. */
export function matchRule(text: string): { type: string; word: string } | null {
  const t = norm(text);
  let best: { type: string; word: string } | null = null;
  for (const r of RULES) for (const w of r.words) {
    const needle = ` ${w.toLowerCase().trim()} `;
    const hit = t.includes(needle) || t.includes(needle.trimEnd() + "s ") /* plural */;
    if (hit && (!best || w.length > best.word.length)) best = { type: r.type, word: w.trim() };
  }
  return best;
}

export function rankSuggestions(o: { text: string; isBusiness: boolean; pockets: SuggestPocket[]; history: HistoryHit[]; max?: number }): SuggestResult {
  const text = o.text.trim();
  if (text.length < 2) return { suggestions: [], hint: null };
  const usable = o.pockets.filter((p) => !p.isSystemManaged);
  const byId = new Map(usable.map((p) => [p.id, p]));
  const out = new Map<string, Suggestion>();
  const add = (p: SuggestPocket, source: Suggestion["source"], reason: string, score: number) => {
    const prev = out.get(p.id);
    if (prev && prev.score >= score) return;
    out.set(p.id, {
      categoryId: p.id, name: p.name, group: p.group, source, reason, score,
      deductible: o.isBusiness && (p.isTaxDeductible || isBusinessType(p.expenseType)),
      typeLabel: typeLabel(p.expenseType),
    });
  };

  for (const h of o.history) {
    const p = byId.get(h.categoryId);
    if (!p) continue;
    add(p, "history", h.count === 1 ? `Last time, ${h.payee} went here` : `${h.count} times before, ${h.payee} went here`, (h.exact ? 100 : 80) + Math.min(h.count, 20));
  }

  const rule = matchRule(text);
  let hint: RuleHint | null = null;
  if (rule) {
    const label = TYPE_BY_KEY.get(rule.type)?.label ?? rule.type;
    const matches = usable.filter((p) => p.expenseType === rule.type);
    for (const p of matches) add(p, "rule", `"${rule.word}" is usually ${label}`, 60);
    if (matches.length === 0) hint = { typeKey: rule.type, label, missing: true };
  }

  const words = norm(text).trim().split(" ").filter((w) => w.length >= 4);
  for (const p of usable) {
    const pn = norm(p.name);
    if (words.some((w) => pn.includes(` ${w}`) )) add(p, "name", `Matches the pocket name "${p.name}"`, 50);
  }

  const suggestions = [...out.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, o.max ?? 3);
  return { suggestions, hint };
}

/** Tax set aside for an expense you can deduct: amount × rate (basis points). */
export const taxSavingCents = (amountCents: number, taxBps: number) => Math.round((Math.max(0, amountCents) * Math.max(0, taxBps)) / 10000);
