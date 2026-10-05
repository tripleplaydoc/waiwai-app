# WaiWai

Zero-based (envelope) budgeting with separate **Personal** and **Business**
workspaces. Next.js (App Router) + Prisma 7 + Supabase Postgres, hosted on
Netlify.

## What works now

- Password-protected (set `APP_PASSWORD`); nothing is public.
- Budget screen: Ready to Assign, envelopes with Assigned / Activity / Available,
  inline editing of assigned amounts, month navigation, priority "Auto-assign".
- Accounts with balances; add transactions (keyboard: **N** opens the form,
  **Esc** closes, full Tab order); inline re-categorizing.
- CSV bank-statement import with preview, three column layouts, and
  duplicate protection (safe to re-import the same file).
- Light/dark mode; all money stored as integer cents.

Not built yet: Business tax-reserve automation (30% holdback, deduction
rebalance, quarterly payments), transfers, split transactions, receipts, net worth.

## Environment variables (Netlify: Site configuration → Environment variables)

| Name | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Supabase pooled connection string (Connect button → Transaction pooler) |
| `APP_PASSWORD` | yes | 8+ characters. You type this on the login screen |
| `DIRECT_URL` | no | Only needed to run Prisma migrations from your computer |
| `APP_TIMEZONE` | no | Defaults to `Pacific/Honolulu` |

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill it in
3. `npm run dev`

## Database

The schema is `prisma/schema.prisma`; `prisma/migrations/0_init/migration.sql`
is already applied to the live Supabase database, with Row Level Security
enabled on every table (the app connects straight to Postgres, so it is not
affected, but Supabase's public API can no longer read your data).

**Supabase free projects pause after about a week without activity.** If the
site shows "Database not reachable", open the Supabase dashboard and click
Restore project (or use `/status`).

<!-- redeploy marker: picks up APP_PASSWORD (2026-10-03) -->

## WaiWai features (Oct 2026)
- Income sits at the top of the budget; each pocket has a **type** (Advertising, Auto expense, Housing…) used by the P&L.
- **Reports** page: profit & loss by type with prior-period comparison, CSV export, print, and (Business) a tax set-aside estimate.
- **Receipts** attach to any transaction (photo or PDF, stored in the database, shown behind login only). On a phone, **Scan receipt** opens the camera, finds the paper's edges, straightens it and cleans it to black & white, all on the device.
- **Can I buy this?** (the + menu): enter what you want, the price and the pocket; it says yes or no and suggests where to borrow (Ready to assign, then free pockets, then spare bill money, then goals), with one tap to apply.
- **People**: every transaction records who made it; filter by person on an account, see a By person report, and a Person column in exports. Profile pictures are set in Settings.
- **Move money** between pockets from the + button, the budget page, or by tapping a pocket's available amount.
- A daily rotating verse / saying from `webapp/lib/verses.ts`.
- **Custom types**: choose "+ Add a custom type…" on any pocket.
- **Household access** (Settings): the owner adds a login for a spouse; everyone shares the same budgets.
- **Exports** (Reports): QuickBooks Online bank CSV, full transactions CSV, Schedule C summary, P&L.

## Cashflow waterfall, tags, reviews and reports (Oct 2026, round 5)
- **Assign button** (budget page, after "Flow → Set up the waterfall"): Ready to assign is repaid to any reserve it was pulled from first, then split 30% Taxes / 70% OPEX; OPEX pockets fill to their monthly costs; overflow fills Reservoir 1 (months × monthly OPEX, default 3); then it splits 50/50 to Reservoir 2 (default 3 months) and Cash; once both reservoirs are full everything goes to Cash, shared by each Cash pocket's %. All settings are in Flow → Settings. Pure math: `lib/budget/cashflow-waterfall.ts` (tests: `npx tsx lib/budget/cashflow-waterfall.test.ts`).
- **Cover from reserves**: overspent OPEX pockets are covered 50/50 from Taxes and Reservoir 1, then Reservoir 2; each pull is a `ReserveDraw` that the next Assign pays back first.
- **Expense tags** (Cultivate, Preserve, Support, Regenerate, Leakage; several per expense) on the transaction forms and the Tag button on each expense. Wording lives in `lib/budget/expense-tags.ts`.
- **Reports tabs**: Overview (P&L + Age of money), Expenses (ring by category/type/tag), Assets (growth, monthly/quarterly/annual, optional Personal + Business), Cash flow (Cashflow-game style statement; tag income pockets earned/portfolio/passive via the pocket pencil), Review (the three monthly questions per expense).
- **Assets & liabilities**: Accounts → "Assets & liabilities"; each value update keeps history. Accounts can now be edited (pencil), including the starting balance.
- **Receipt scanner**: rotate, magnifier while dragging corners, Preview before saving, better edge finding on light tables (`lib/scan/geometry.test.ts`).

### Personal flow: Give / Save / Live (Oct 2026)

On the **Personal** workspace the Flow chip sets up a three-way split. **Assign** sends Ready to assign to Give 20% / Save 10% / Live 70% (all adjustable, must add to 100%). Each bucket pays into one or more categories; inside a bucket, pockets with a monthly cost or goal fill first (proportionally if short), and what is left is shared by each pocket's "share of what's left" (if none is set, the bucket's first pocket takes it). A bucket with no pockets leaves its money in Ready to assign. Setup reuses existing categories named Give/Giving, Save/Savings and Live/Bills/Everyday, and creates what is missing. Engine: `lib/budget/personal-flow.ts` (tested with `npx tsx lib/budget/personal-flow.test.ts`). Dialogs now render in a portal so they are never clipped by the Flow popover.

## Live prices, vehicles and loans (assets & liabilities)
- **Crypto and stocks/funds**: open the holding and add each coin (symbol + how many) or ticker (+ shares). Prices come from free public feeds (Coinbase, then CoinGecko for coins; Yahoo Finance, then Stooq for stocks; optional `FINNHUB_API_KEY` / `COINGECKO_API_KEY`). They refresh when the app opens, every 10 minutes while it's open, and on the refresh button. Each refresh saves one value snapshot per day, so the Assets report shows growth. Prices are held as exact decimals; only the final value is rounded to cents.
- **Vehicles**: VIN lookup (free US NHTSA database) fills in year/make/model/trim. Kelley Blue Book has no free feed, so the page links to the car on KBB and you type the value in; values older than 90 days get a reminder.
- **Loans**: rate, payment, original amount and term per loan; a live payoff calculator (extra monthly, one-time payment, "paid off in N years" payment, schedule) and a Debt payoff plan (avalanche / snowball) across all debts.
- Env overrides for testing: `COINBASE_BASE`, `COINGECKO_BASE`, `YAHOO_BASE`, `STOOQ_BASE`, `FINNHUB_BASE`, `NHTSA_BASE`.
- **Reinvested dividends / buying more**: open a position (pencil) → "Add shares". Adds to the share count, and to the cost basis when one is tracked (so gain stays accurate), with a history and undo. Cash dividends go in the account's Cash line.

## Credit cards
- Spending on a card comes out of the pocket you pick, exactly like cash. A card's status is computed (no extra pockets): **set aside** = what you owe minus the **short** part, where short = pockets overspent because of card charges + card spending with no pocket yet (never more than is owed).
- The card page shows the status in plain words, **Pay card** (a two-sided transfer, not spending), **Cover the shortfall** (from Ready to Assign or another pocket), and interest rate / minimum payment (feeds the Debt payoff plan and creates an "Interest & fees" pocket). The Accounts list and Budget screen flag any short card.
- When adding a card, type what you owe as a plain number; deleting one half of a payment removes both halves.
- **Statement date and due date**: on the card page, "Dates, interest rate & minimum payment" takes the day of the month the statement closes and the day the payment is due (1 to 31; short months use their last day). The card page shows the next dates, the Accounts list says "Payment due in N days", and the Budget screen shows a banner when you owe money and the payment is due within 5 days.

## Bills calendar
The **Bills** chip on the Budget screen opens a month calendar (it follows the month you're viewing). Each day with a bill is colored by status: green = paid, amber = due soon (within 7 days), red = overdue, grey = upcoming; a day with several bills takes its most urgent color. Tap a day to see its bills with amount, status and **Mark paid** / **Undo**. Credit cards with a balance and a due day also appear on their due date, with an **Open card** button.

## Adding money to a pocket
Tap a pocket's amount on the Budget screen to open **Pocket money**. **Add money** (the default tab) takes an amount from Ready to Assign and adds it on top of what's already assigned, showing the new assigned and available totals before you confirm; **All ready** fills in everything that's unassigned. The **Move money** tab moves money out of the pocket into another one.

## Where's my cash (money tagged to bank accounts)
Every dollar of Ready to Assign sits in a bank account: its starting balance, income recorded in it, and cash moved in from your other accounts. When you assign money to a pocket, that account tag goes with it (**Add money** lets you choose the account; automatic flows take from the account with the most ready cash). Moving money between pockets, releasing it and covering shortfalls all carry the tags along, and a purchase comes out of the account that paid for it first.

The **Cash** chip on the Budget screen shows each account's real balance next to what your budget expects it to hold, with a plain-words note when they differ. Tap an account and the whole budget switches to that account's money: Ready to Assign and every pocket's amount show only what sits there. Money assigned before this existed is shown as "not tagged yet", with a one-tap way to say which account it is in.
