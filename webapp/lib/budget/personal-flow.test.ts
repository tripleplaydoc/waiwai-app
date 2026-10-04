import { planPersonalAssign, splitAll, type PersonalAssignInput } from "./personal-flow";

let failed = 0;
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { failed++; console.error(`FAIL ${name}\n  got      ${JSON.stringify(a)}\n  expected ${JSON.stringify(b)}`); } else console.log(`ok   ${name}`);
};

const base: PersonalAssignInput = {
  readyCents: 100000,
  splits: { GIVE: 2000, SAVE: 1000, LIVE: 7000 },
  buckets: {
    GIVE: [{ id: "tithe", needCents: 0, shareBps: 10000 }],
    SAVE: [{ id: "emerg", needCents: 0, shareBps: 6000 }, { id: "trip", needCents: 0, shareBps: 4000 }],
    LIVE: [{ id: "rent", needCents: 40000, shareBps: 0 }, { id: "food", needCents: 20000, shareBps: 0 }, { id: "fun", needCents: 0, shareBps: 10000 }],
  },
};
const sum = (p: ReturnType<typeof planPersonalAssign>) => p.moves.reduce((s, m) => s + m.cents, 0);
const by = (p: ReturnType<typeof planPersonalAssign>, id: string) => p.moves.find((m) => m.categoryId === id)?.cents ?? 0;

let p = planPersonalAssign(base);
eq("20/10/70 totals", p.totals, { GIVE: 20000, SAVE: 10000, LIVE: 70000 });
eq("give goes to its pocket", by(p, "tithe"), 20000);
eq("save shared 60/40", [by(p, "emerg"), by(p, "trip")], [6000, 4000]);
eq("live fills needs then extra", [by(p, "rent"), by(p, "food"), by(p, "fun")], [40000, 20000, 10000]);
eq("conservation", sum(p) + p.leftoverCents, 100000);
eq("no leftover", p.leftoverCents, 0);

// Live short: needs filled proportionally, nothing to Everyday
p = planPersonalAssign({ ...base, readyCents: 50000 });
eq("live short is proportional", [by(p, "rent"), by(p, "food"), by(p, "fun")], [23333, 11667, 0]);
eq("live short conservation", sum(p) + p.leftoverCents, 50000);

// adjustable percentages
p = planPersonalAssign({ ...base, splits: { GIVE: 1000, SAVE: 2500, LIVE: 6500 } });
eq("custom split", p.totals, { GIVE: 10000, SAVE: 25000, LIVE: 65000 });

// odd cents never lost or invented
p = planPersonalAssign({ ...base, readyCents: 100001 });
eq("odd cent conservation", sum(p) + p.leftoverCents, 100001);
eq("odd cent no leftover", p.leftoverCents, 0);

// bucket without pockets stays in Ready to assign
p = planPersonalAssign({ ...base, buckets: { ...base.buckets, GIVE: [] } });
eq("empty bucket leftover", p.leftoverCents, 20000);

// no shares set: first pocket takes the extra
p = planPersonalAssign({ ...base, buckets: { ...base.buckets, SAVE: [{ id: "a", needCents: 0, shareBps: 0 }, { id: "b", needCents: 0, shareBps: 0 }] } });
eq("first pocket takes extra", [by(p, "a"), by(p, "b")], [10000, 0]);

// splits that don't add to 100% leave the rest in Ready to assign
p = planPersonalAssign({ ...base, splits: { GIVE: 2000, SAVE: 1000, LIVE: 5000 } });
eq("under 100% leaves remainder", p.leftoverCents, 20000);

eq("splitAll", splitAll(100, [1, 1, 1]), [34, 33, 33]);
eq("zero ready", planPersonalAssign({ ...base, readyCents: 0 }).moves.length, 0);

if (failed) { console.error(`${failed} failed`); process.exit(1); }
