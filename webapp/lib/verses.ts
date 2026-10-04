/**
 * Daily inspiration on wealth, work, stewardship and generosity.
 * Scripture is quoted from the King James Version (Bible) and the standard
 * LDS editions (Book of Mormon, Doctrine and Covenants, Pearl of Great Price).
 */
export type VerseSource = "Bible" | "Book of Mormon" | "Doctrine and Covenants" | "Pearl of Great Price" | "Inspiration";
export interface Verse { text: string; ref: string; source: VerseSource }

export const VERSES: Verse[] = [
  // Bible (KJV)
  { source: "Bible", ref: "Proverbs 21:5", text: "The thoughts of the diligent tend only to plenteousness; but of every one that is hasty only to want." },
  { source: "Bible", ref: "Proverbs 10:4", text: "He becometh poor that dealeth with a slack hand: but the hand of the diligent maketh rich." },
  { source: "Bible", ref: "Proverbs 13:11", text: "Wealth gotten by vanity shall be diminished: but he that gathereth by labour shall increase." },
  { source: "Bible", ref: "Proverbs 3:9–10", text: "Honour the LORD with thy substance, and with the firstfruits of all thine increase: so shall thy barns be filled with plenty." },
  { source: "Bible", ref: "Proverbs 21:20", text: "There is treasure to be desired and oil in the dwelling of the wise; but a foolish man spendeth it up." },
  { source: "Bible", ref: "Proverbs 22:7", text: "The rich ruleth over the poor, and the borrower is servant to the lender." },
  { source: "Bible", ref: "Proverbs 27:23", text: "Be thou diligent to know the state of thy flocks, and look well to thy herds." },
  { source: "Bible", ref: "Proverbs 14:23", text: "In all labour there is profit: but the talk of the lips tendeth only to penury." },
  { source: "Bible", ref: "Proverbs 11:25", text: "The liberal soul shall be made fat: and he that watereth shall be watered also himself." },
  { source: "Bible", ref: "Proverbs 16:3", text: "Commit thy works unto the LORD, and thy thoughts shall be established." },
  { source: "Bible", ref: "Proverbs 6:6", text: "Go to the ant, thou sluggard; consider her ways, and be wise." },
  { source: "Bible", ref: "Proverbs 28:20", text: "A faithful man shall abound with blessings." },
  { source: "Bible", ref: "Psalm 1:3", text: "And he shall be like a tree planted by the rivers of water, that bringeth forth his fruit in his season; his leaf also shall not wither; and whatsoever he doeth shall prosper." },
  { source: "Bible", ref: "Isaiah 58:11", text: "And the LORD shall guide thee continually, and satisfy thy soul in drought … and thou shalt be like a watered garden, and like a spring of water, whose waters fail not." },
  { source: "Bible", ref: "Ecclesiastes 11:1", text: "Cast thy bread upon the waters: for thou shalt find it after many days." },
  { source: "Bible", ref: "Ecclesiastes 5:10", text: "He that loveth silver shall not be satisfied with silver; nor he that loveth abundance with increase." },
  { source: "Bible", ref: "Malachi 3:10", text: "Bring ye all the tithes into the storehouse … and prove me now herewith, saith the LORD of hosts, if I will not open you the windows of heaven, and pour you out a blessing, that there shall not be room enough to receive it." },
  { source: "Bible", ref: "Deuteronomy 8:18", text: "But thou shalt remember the LORD thy God: for it is he that giveth thee power to get wealth." },
  { source: "Bible", ref: "Matthew 6:21", text: "For where your treasure is, there will your heart be also." },
  { source: "Bible", ref: "Matthew 6:33", text: "But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you." },
  { source: "Bible", ref: "Luke 14:28", text: "For which of you, intending to build a tower, sitteth not down first, and counteth the cost, whether he have sufficient to finish it?" },
  { source: "Bible", ref: "Luke 16:10", text: "He that is faithful in that which is least is faithful also in much." },
  { source: "Bible", ref: "2 Corinthians 9:6", text: "He which soweth sparingly shall reap also sparingly; and he which soweth bountifully shall reap also bountifully." },
  { source: "Bible", ref: "Philippians 4:19", text: "But my God shall supply all your need according to his riches in glory by Christ Jesus." },
  { source: "Bible", ref: "Proverbs 3:13–14", text: "Happy is the man that findeth wisdom, and the man that getteth understanding. For the merchandise of it is better than the merchandise of silver, and the gain thereof than fine gold." },
  // Book of Mormon
  { source: "Book of Mormon", ref: "Jacob 2:18–19", text: "Before ye seek for riches, seek ye for the kingdom of God. And after ye have obtained a hope in Christ ye shall obtain riches, if ye seek them; and ye will seek them for the intent to do good." },
  { source: "Book of Mormon", ref: "Jacob 2:17", text: "Think of your brethren like unto yourselves, and be familiar with all and free with your substance, that they may be rich like unto you." },
  { source: "Book of Mormon", ref: "Mosiah 4:27", text: "See that all these things are done in wisdom and order; for it is not requisite that a man should run faster than he has strength. And again, it is expedient that he should be diligent, that thereby he might win the prize." },
  { source: "Book of Mormon", ref: "2 Nephi 9:51", text: "Wherefore, do not spend money for that which is of no worth, nor your labor for that which cannot satisfy." },
  { source: "Book of Mormon", ref: "Mosiah 4:26", text: "I would that ye should impart of your substance to the poor, every man according to that which he hath, such as feeding the hungry, clothing the naked, visiting the sick and administering to their relief." },
  // Doctrine and Covenants
  { source: "Doctrine and Covenants", ref: "D&C 104:17", text: "For the earth is full, and there is enough and to spare; yea, I prepared all things, and have given unto the children of men to be agents unto themselves." },
  { source: "Doctrine and Covenants", ref: "D&C 104:13", text: "It is expedient that I, the Lord, should make every man accountable, as a steward over earthly blessings, which I have made and prepared for my creatures." },
  { source: "Doctrine and Covenants", ref: "D&C 6:7", text: "Seek not for riches but for wisdom; and behold, the mysteries of God shall be unfolded unto you, and then shall you be made rich. Behold, he that hath eternal life is rich." },
  { source: "Doctrine and Covenants", ref: "D&C 42:42", text: "Thou shalt not be idle; for he that is idle shall not eat the bread nor wear the garments of the laborer." },
  { source: "Doctrine and Covenants", ref: "D&C 38:30", text: "Treasure up wisdom in your bosoms … but if ye are prepared ye shall not fear." },
  // Pearl of Great Price
  { source: "Pearl of Great Price", ref: "Moses 7:18", text: "And the Lord called his people Zion, because they were of one heart and one mind, and dwelt in righteousness; and there was no poor among them." },
  { source: "Pearl of Great Price", ref: "Moses 5:1", text: "Adam began to till the earth, and to have dominion over all the beasts of the field, and to eat his bread by the sweat of his brow, as I, the Lord, had commanded him." },
  { source: "Pearl of Great Price", ref: "Articles of Faith 1:13", text: "We believe in being honest, true, chaste, benevolent, virtuous, and in doing good to all men." },
  // Other inspiration
  { source: "Inspiration", ref: "Benjamin Franklin, The Way to Wealth (1758)", text: "If you would be wealthy, think of saving as well as of getting." },
  { source: "Inspiration", ref: "Benjamin Franklin, The Way to Wealth (1758)", text: "Beware of little expenses; a small leak will sink a great ship." },
  { source: "Inspiration", ref: "Seneca, Letters to Lucilius (paraphrased)", text: "It is not the man who has too little, but the man who craves more, that is poor." },
  { source: "Inspiration", ref: "Tao Te Ching 33 (translations vary)", text: "He who knows he has enough is rich." },
  { source: "Inspiration", ref: "Hawaiian proverb (ʻŌlelo Noʻeau)", text: "He aliʻi ka ʻāina; he kauwā ke kanaka. — The land is chief; the people are its servants." },
  { source: "Inspiration", ref: "Often attributed to Warren Buffett", text: "Do not save what is left after spending, but spend what is left after saving." },
  { source: "Inspiration", ref: "Often attributed to Warren Buffett", text: "Someone is sitting in the shade today because someone planted a tree a long time ago." },
  { source: "Inspiration", ref: "Waiwai", text: "Waiwai — “water water.” In Hawaiʻi, abundant fresh water is wealth: keep it flowing, and keep it clean." },
];

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

/** Same verse all day, a different one tomorrow; a coprime stride keeps neighbouring days from feeling alike. */
export function verseFor(dayNumber: number): Verse {
  const n = VERSES.length;
  let stride = 7;
  while (gcd(stride, n) !== 1) stride++;
  return VERSES[(((dayNumber * stride) % n) + n) % n];
}

export function dayNumberFromIso(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}
