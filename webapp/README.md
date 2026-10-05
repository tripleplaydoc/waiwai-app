# WaiWai

Zero-based (envelope) budgeting with separate **Personal** and **Business**
workspaces. Next.js (App Router) + Prisma 7 + Supabase Postgres, hosted on
Netlify.

## What works now

- Password-protected (set `APP_PASSWORD`); nothing is public.
- Budget screen: Money in pool, envelopes with Assigned / Activity / Available,
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
- **Can I buy this?** (the + menu): enter what you want, the price and the pocket; it says yes or no and suggests where to borrow (Money in pool, then free pockets, then spare bill money, then goals), with one tap to apply.
- **People**: every transaction records who made it; filter by person on an account, see a By person report, and a Person column in exports. Profile pictures are set in Settings.
- **Move money** between pockets from the + button, the budget page, or by tapping a pocket's available amount.
- A daily rotating verse / saying from `webapp/lib/verses.ts`.
- **Custom types**: choose "+ Add a custom type…" on any pocket.
- **Household access** (Settings): the owner adds a login for a spouse; everyone shares the same budgets.
- **Exports** (Reports): QuickBooks Online bank CSV, full transactions CSV, Schedule C summary, P&L.

## Cashflow waterfall, tags, reviews and reports (Oct 2026, round 5)
- **Assign button** (budget page, after "Flow → Set up the waterfall"): Money in pool is repaid to any reserve it was pulled from first, then split 30% Taxes / 70% OPEX; OPEX pockets fill to their monthly costs; overflow fills Reservoir 1 (months × monthly OPEX, default 3); then it splits 50/50 to Reservoir 2 (default 3 months) and Cash; once both reservoirs are full everything goes to Cash, shared by each Cash pocket's %. All settings are in Flow → Settings. Pure math: `lib/budget/cashflow-waterfall.ts` (tests: `npx tsx lib/budget/cashflow-waterfall.test.ts`).
- **Cover from reserves**: overspent OPEX pockets are covered 50/50 from Taxes and Reservoir 1, then Reservoir 2; each pull is a `ReserveDraw` that the next Assign pays back first.
- **Expense tags** (Cultivate, Preserve, Support, Regenerate, Leakage; several per expense) on the transaction forms and the Tag button on each expense. Wording lives in `lib/budget/expense-tags.ts`.
- **Reports tabs**: Overview (P&L + Age of money), Expenses (ring by category/type/tag), Assets (growth, monthly/quarterly/annual, optional Personal + Business), Cash flow (Cashflow-game style statement; tag income pockets earned/portfolio/passive via the pocket pencil), Review (the three monthly questions per expense).
- **Assets & liabilities**: Accounts → "Assets & liabilities"; each value update keeps history. Accounts can now be edited (pencil), including the starting balance.
- **Receipt scanner**: rotate, magnifier while dragging corners, Preview before saving, better edge finding on light tables (`lib/scan/geometry.test.ts`).

### Personal flow: Give / Save / Live (Oct 2026)

On the **Personal** workspace the Flow chip sets up a three-way split. **Assign** sends Money in pool to Give 20% / Save 10% / Live 70% (all adjustable, must add to 100%). Each bucket pays into one or more categories; inside a bucket, pockets with a monthly cost or goal fill first (proportionally if short), and what is left is shared by each pocket's "share of what's left" (if none is set, the bucket's first pocket takes it). A bucket with no pockets leaves its money in Money in pool. Setup reuses existing categories named Give/Giving, Save/Savings and Live/Bills/Everyday, and creates what is missing. Engine: `lib/budget/personal-flow.ts` (tested with `npx tsx lib/budget/personal-flow.test.ts`). Dialogs now render in a portal so they are never clipped by the Flow popover.

## Live prices, vehicles and loans (assets & liabilities)
- **Crypto and stocks/funds**: open the holding and add each coin (symbol + how many) or ticker (+ shares). Prices come from free public feeds (Coinbase, then CoinGecko for coins; Yahoo Finance, then Stooq for stocks; optional `FINNHUB_API_KEY` / `COINGECKO_API_KEY`). They refresh when the app opens, every 10 minutes while it's open, and on the refresh button. Each refresh saves one value snapshot per day, so the Assets report shows growth. Prices are held as exact decimals; only the final value is rounded to cents.
- **Vehicles**: VIN lookup (free US NHTSA database) fills in year/make/model/trim. Kelley Blue Book has no free feed, so the page links to the car on KBB and you type the value in; values older than 90 days get a reminder.
- **Loans**: rate, payment, original amount and term per loan; a live payoff calculator (extra monthly, one-time payment, "paid off in N years" payment, schedule) and a Debt payoff plan (avalanche / snowball) across all debts.
- Env overrides for testing: `COINBASE_BASE`, `COINGECKO_BASE`, `YAHOO_BASE`, `STOOQ_BASE`, `FINNHUB_BASE`, `NHTSA_BASE`.
- **Reinvested dividends / buying more**: open a position (pencil) → "Add shares". Adds to the share count, and to the cost basis when one is tracked (so gain stays accurate), with a history and undo. Cash dividends go in the account's Cash line.

## Credit cards
- Spending on a card comes out of the pocket you pick, exactly like cash. A card's status is computed (no extra pockets): **set aside** = what you owe minus the **short** part, where short = pockets overspent because of card charges + card spending with no pocket yet (never more than is owed).
- The card page shows the status in plain words, **Pay card** (a two-sided transfer, not spending), **Cover the shortfall** (from Money in pool or another pocket), and interest rate / minimum payment (feeds the Debt payoff plan and creates an "Interest & fees" pocket). The Accounts list and Budget screen flag any short card.
- When adding a card, type what you owe as a plain number; deleting one half of a payment removes both halves.
- **Statement date and due date**: on the card page, "Dates, interest rate & minimum payment" takes the day of the month the statement closes and the day the payment is due (1 to 31; short months use their last day). The card page shows the next dates, the Accounts list says "Payment due in N days", and the Budget screen shows a banner when you owe money and the payment is due within 5 days.

## Bills calendar
The **Bills** chip on the Budget screen opens a month calendar (it follows the month you're viewing). Each day with a bill is colored by status: green = paid, amber = due soon (within 7 days), red = overdue, grey = upcoming; a day with several bills takes its most urgent color. Tap a day to see its bills with amount, status and **Mark paid** / **Undo**. Credit cards with a balance and a due day also appear on their due date, with an **Open card** button.

## Adding money to a pocket
Tap a pocket's amount on the Budget screen to open **Pocket money**. **Add money** (the default tab) takes an amount from Money in pool and adds it on top of what's already assigned, showing the new assigned and available totals before you confirm; **All ready** fills in everything that's in the pool. If the pocket has a target (or is overspent), a yellow line shows what it still needs, with **Fill what's needed** (or **Use what's there** when the pool is short) to fill in the amount for you. The **Move money** tab moves money out of the pocket into another one.

## Stewards (whose money is it?)
Every bank account has a **steward**: the household member who looks after it (set when you add the account, or with the pencil on the Accounts page; shown under the account's name). Every dollar of Money in pool sits in a bank account, so it belongs to that account's steward. When you assign money to a pocket, the account (and so the steward) goes with it. **Add money** lets you choose which account to take from and starts on one of your own accounts.

With two or more stewards, the Money in pool number shows each person's share underneath, and tapping a pocket shows "Rent was funded by Mike $1,200 · Sarah $300". Moving money between pockets, back to Money in pool, and covering shortfalls all carry the steward along, and a purchase comes out of the account that paid for it first. Older money assigned before accounts were tracked shows as "Not credited". With only one steward nothing extra is shown.

**Transfer** (Accounts page) moves cash from one of your bank accounts to another. It isn't spending, so no pocket changes, and deleting either half removes both. If the sending account has less free cash than you move, the pocket money credited to it moves along to the receiving account (shown in the confirmation).

### Moving money back to Money in pool
Tap a pocket, open the **Move money** tab, and leave **Move to** on "↩ Money in pool" (the default). Enter an amount (or **All**) and tap **Move to the pool**. Only money that is still available in the pocket can be moved; the account it came from goes back with it.


> "Ready to assign" is now called **Money in pool** everywhere in the app.

## Paid from (each pocket remembers its bank account)
With two or more bank accounts, the pocket's edit dialog (pencil) has a **Paid from** choice, for example Software = Found, Advertising = Novo. A pocket with an account shows "from Found" under its name. Opening **Add money** on that pocket starts on its account, and the automatic Assign buttons (Assign, Assign by %, auto-assign) take that pocket's money from its account first, then from the account with the most free cash if it runs short. You can still pick a different account for any single add. Pockets left on "Any account" draw from your own account with the most free cash.

Recording an expense follows the same rule: when you pick a pocket that is paid from a particular account, the **Account** box in the Add transaction form (the + button and the account page) switches to that account. You can still change it before saving.

The **Estimated Tax Reserve** pocket can be topped up by hand too: tap its amount, pick the account the tax money is coming from (for example Found), and add. It also has a **Paid from** choice in its pencil dialog. Money can only be added to it this way, not moved out; use the tax rebalance for that.

A monthly cost that is **paid** for the month (ticked Mark paid, or enough spending recorded to reach its amount) drops out of "Cover this month?" / "Short" and out of the Assign buttons' needs for that month. It comes back next month.

## Months ahead (monthly-cost pockets)
For a pocket with a **Monthly cost**, the pencil dialog has **Months ahead** (This month only, or 1 to 6 months ahead). With it set, the pocket's need is measured on its balance: this month's cost plus that many more months while the bill is unpaid, and just the extra months once it is paid. For example, a $200 cost kept 1 month ahead needs $400 on hand; after you pay the $200 it needs the $200 cushion to stay in place, and next month it asks for $200 to rebuild up to $400. The Add money sheet's **Fill what's needed**, the "Cover this month?" check and the Assign buttons all use this. The pocket row shows "1 mo ahead". Leave it on "This month only" for variable costs.

**Set it for all of OPEX at once.** In the cashflow panel, under the OPEX line, **OPEX months ahead** sets Months ahead on every monthly-cost pocket in your OPEX category in one step (Apply to all). It shows "They are set differently right now" when pockets differ. Pockets without a monthly cost, and anything outside OPEX, are left alone; you can still override a single pocket in its pencil dialog.

**"Cover this month?" ignores the cushion.** The check at the top of the budget counts only what this month's costs and goal pace still need. Any Months ahead cushion is shown separately underneath ("Months-ahead cushion: $X still to build"), so a fully covered month never reads as short just because you turned Months ahead on. Pocket rows and Fill what's needed still go all the way to the cushion goal.

## Loans on the budget (Affirm, Upgrade and similar)
The **Loans** chip next to Bills lists every loan with its monthly payment, due date, how many payments are paid and how many are left. **Add loan** takes the loan amount, number of payments, payment each month (worked out for you if left blank, using the interest rate, 0% by default), first payment due date, budget category and the bank account it is paid from. The payment then appears as a monthly bill (a pocket with a due date), so it shows in Bills, the calendar, "Cover this month?", Fill what's needed and the waterfall like any other cost.

Loans you already track under Assets & liabilities show under "Not on the budget yet" with a **Set up** button; setting one up only adds terms and a budget pocket, it never changes the balance. Payments are counted from the schedule: every payment due in an earlier month counts as paid, and this month's counts once you mark it paid or record the spending. Before the first due month the pocket has no target or due date; after the last payment it is archived and the loan shows as paid off. **Take off budget** in the edit dialog removes the pocket and keeps the loan in net worth.

New loans start with their owed balance set from the schedule; after that the balance is still the one you update by hand on the Assets & liabilities page. Loans are monthly only for now.

**Secured loans (car, mortgage, boat…).** In the Add / Set up loan dialog, **Secured by** ties the loan to one of your assets from Assets & liabilities. The loan row then shows the asset, what it is worth and your equity (value minus the owed balance), and the asset page shows the same equity. An asset can be tied to one loan at a time; picking one already tied elsewhere replaces that link (the list says which). Add the asset first if it isn't listed. Equity uses the owed balance recorded on the loan, so keep that up to date.

**Use a pocket you already have.** When you add or set up a loan, **Pocket** lists the pockets already on your budget that aren't paying a loan. Choosing one ("Use Hotels payment") links the loan to that pocket instead of making a new one: the pocket keeps its name, category, assigned money and history, its monthly target becomes the loan payment, and it gets the due date. The budget category choice is hidden in that case. A pocket can pay one loan at a time. Once the loan is linked, the Loans edit dialog shows which pocket pays it.

**Loans already in progress.** The loan dialog opens on **Where it stands now**, so you don't need the original amount or the original payment count. Enter the balance still owed (prefilled from the loan's balance in net worth), the payment, and the next payment due date. **Payments left** is optional: leave it blank and it's worked out from the balance, payment and rate (shown as "about N"). Saving also records the balance you entered as the loan's current balance. If this month's payment is already made, use next month's date. The schedule then counts down from that date, so rows show "N left" rather than "x of y paid". Edit the loan any time the numbers drift from your lender's; **From the start** is there when you do know the original amount, count and first due date, and then paid-off payments are counted for you.

## Smart pocket suggestions (Quick Add)
In **Add transaction**, Payee and Memo now sit at the top. As you type, up to three pockets are suggested under them, one tap to choose:
1. **Your own history**: pockets that same payee (or a similar name) went to before, with how many times.
2. **Built-in vendor and keyword rules** (Zoom, Adobe → Software; airlines, hotels → Travel; ads, shipping, insurance, fees and so on), matched to your pockets by their Type. The longest keyword wins, whole words only.
3. **A pocket whose own name appears in the text.**

On a business budget each suggestion shows **Deductible · saves $X**, where X is the amount × your tax reserve rate (the waterfall's tax % when it is on, otherwise the tax profile rate, 30% by default). Tapping a suggestion fills the Pocket and ticks Tax-deductible; the checkbox also shows how much less tax reserve you'll need. If a vendor looks like a type you have no pocket for (say Office expense), it says so and you pick the closest pocket. The app's own tax reserve pocket is never suggested. These are starting points, not tax advice: confirm unclear ones with your CPA. Not yet covered: suggestions for imported CSV rows, asking about business-use percentage or meals, and a sweep for missed deductions.
