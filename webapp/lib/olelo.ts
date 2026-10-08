/**
 * ʻŌlelo noʻeau of the day: a Hawaiian proverb with its English meaning and a short money reflection.
 *
 * The proverbs and translations are from Mary Kawena Pukui, ʻŌlelo Noʻeau: Hawaiian Proverbs & Poetical Sayings
 * (Bishop Museum Press, 1983); the number is the proverb's number in that book. Use only proverbs that have been
 * verified against it. The reflections are our own words, not Pukui's.
 *
 * TODO(review): please have a Hawaiian-language speaker check the proverbs, the diacritics (ʻokina and kahakō)
 * and the reflections before wider release.
 */
export interface Olelo { haw: string; en: string; ref: string; reflection: string }

export const OLELO: Olelo[] = [
  {
    haw: "ʻAʻohe hana nui ke alu ʻia.",
    en: "No task is too big when done together by all.",
    ref: "ʻŌlelo Noʻeau #142",
    reflection: "A household budget is shared work. When everyone knows the plan, even a big goal feels lighter.",
  },
  {
    haw: "He aliʻi ka ʻāina; he kauwā ke kanaka.",
    en: "The land is chief; man is its servant.",
    ref: "ʻŌlelo Noʻeau #531",
    reflection: "What we are given is something to care for. Spend, save and give as a steward, not only as an owner.",
  },
  {
    haw: "Ma ka hana ka ʻike.",
    en: "In working one learns.",
    ref: "ʻŌlelo Noʻeau #2089",
    reflection: "Every entry you make teaches you something about your money. Keep showing up and the understanding follows.",
  },
  {
    haw: "I ka wā ma mua, i ka wā ma hope.",
    en: "The future is in the past; look to the past to guide the future.",
    ref: "ʻŌlelo Noʻeau",
    reflection: "Last month's spending is a teacher. Look back kindly, then choose what comes next.",
  },
];

/** 1..366 for a YYYY-MM-DD date. */
export function dayOfYear(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
}

/** Same proverb all day, the next one tomorrow. */
export function oleloFor(iso: string): Olelo {
  const i = (dayOfYear(iso) - 1) % OLELO.length;
  return OLELO[i];
}
