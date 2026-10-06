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

On a business budget each suggestion shows **Deductible · saves $X**, where X is the amount × your tax reserve rate (the waterfall's tax % when it is on, otherwise the tax profile rate, 30% by default). Tapping a suggestion fills the Pocket and ticks Tax-deductible; the checkbox also shows how much less tax reserve you'll need. If a vendor looks like a type you have no pocket for (say Office expense), it says so and you pick the closest pocket. The app's own tax reserve pocket is never suggested. These are starting points, not tax advice: confirm unclear ones with your CPA.

### Also when adding or editing a pocket
Type a pocket's name (say "Zoom") and a blue box says **Looks like Software & subscriptions · usually tax-deductible**, with one button that sets the Type and ticks Tax-deductible. It also shows when a pocket is typed as a business cost but not marked deductible.

### CSV import
After you paste or pick a statement, each money-out row gets a suggested pocket (same history and rules as Quick Add). **Auto-categorize N rows** is on by default and you can change any of the first 25 rows with its Pocket menu; the rest use their suggestion. The bar shows how many are deductible and the estimated tax saved. Rows you categorize are not flagged for review; the rest still are.

### Meals and business use (Quick Add, business budget)
- **Meals** ask for a business purpose (who and why), saved in the memo. Meals count **50%** toward deductions: the savings shown, the Reports tax estimate and the P&L deductible total all use half.
- **Shared costs** (utilities, auto, rent, equipment, insurance, software) ask **how much is for the business**. Under 100% splits the purchase: the business part stays in the pocket you chose, the personal part goes to an auto-created **Owner's draw (personal use)** pocket (type OWNER_DRAW), which the P&L leaves out of expenses so profit isn't understated. The memo gets "(70% business)". That pocket will show as spent beyond what you assigned until you assign it money; that is the owner's draw.

### Deductions to check (Reports → Overview, business)
Lists spending in the period that looks like a business cost but is not counted: uncategorized purchases, purchases in non-deductible pockets, and business-type pockets not marked deductible (**Mark deductible** in one tap), each with the estimated tax saved at your rate. Guidance only, based on payee and memo wording.

## History layer (past years, kept apart from the live budget)
Past years live in their **own tables** (`historical_transactions`, `history_accounts`, `history_settings`), so by construction they can never change an account balance, Ready to Assign, a pocket or net worth. Only the **History** page (Reports → History) reads them. Tested: the budget page is identical with and without imported history.

- **Go-live day** (set to Oct 5, 2026 by the migration). History for an account must end before the earlier of go-live and that account's first live transaction, so history and live data can never overlap or double count.
- **Import past years** (`/history/import`): one account at a time, any number of years in one CSV, safe to re-import (rows already stored are skipped). Rows are typed automatically from the same vendor rules as Quick Add, transfers are set aside, and the rest are named in bulk by payee ("Name the biggest unknowns": pick a type once and every past row from that payee follows).
- **Proof that history connects to today:** per account, enter the date and balance when its history begins. Start balance + all imported rows must equal the opening balance the live budget started from. It says **Connects** or **Off by $X** with likely causes (a missing or doubled deposit, a flipped sign, a swapped digit).
- **Year by year:** revenue, expenses, profit, deductible expenses (meals 50%) and an estimated tax at your rate, with change versus the prior year and a by-type breakdown. The current year combines history and the live budget.
- Migration `20261005280000_history_layer` adds only new tables, so the rest of the app works before it is run; the History page shows a setup note until it is.

### History completions
- **History rows** (`/history/rows`): filter, fix, delete or add rows by hand; sealed years are locked.
- **Only have a tax return?** Type yearly totals per Schedule C line for years before go-live (`history_totals`).
- **Seal** a year when it is final, and **closed accounts** can carry history without touching live balances.
- History feeds Reports (P&L, prior period) and **History CSV** (every year by Schedule C line). It never touches balances, Ready to Assign or net worth.
- Needs migration `20261005300000_history_totals_seal`.

## Coach (`/coach`)
- **Money Meeting**: weekly ten-minute checklist plus one lesson chosen from what the numbers show.
- **Leak finder**: recurring charges, price increases, double charges, overlapping subscriptions, with a negotiation script. Reads live data plus history.
- **Where every $100 went**: income path over 30 days, 90 days or a year.
- **Growth numbers**: net worth change, savings rate, cash runway, freedom number (25x yearly spending).
- **Tax levers** (business): quarterly due dates, projection, what each lever saves at the workspace reserve rate. Planning guidance, not tax advice.
- Pure math lives in `lib/coach/*-math.ts` with tests.

## Balance check and proof line (numbers that match the bank)
- `/accounts/check`: type the balance your bank shows. The app compares it to its own balance for that date and, if they differ, looks for the usual causes: entries not posted yet (uncleared total equals the gap), a missing deposit or payment, a wrong direction, a flipped sign, a duplicate, or two swapped digits. It lists the entries to look at first.
- Every check is saved (`balance_checkpoints`). Each account shows a proof line: "Matched your bank 3 days ago", "Time to check again" after 14 days, or "Off $X at last check".
- **Can't find it yet?** One tap posts a labelled "Balance adjustment" so the app matches the bank, and parks the difference in an **Unaccounted** pocket (on-budget accounts). It is excluded from the P&L and deduction reports. Clear it when you find the cause.
- Credit cards and loans: type the amount you owe, as your bank shows it.
- Balance checkpoints are never read by balances, Ready to Assign or net worth. Needs migration `20261005310000_balance_checkpoints`.

## Tax reserve by account
- Budget → Flow → **Tax reserve by account → Split by account** gives each cash account (checking, savings, cash) its own `Tax Reserve: <account>` pocket. The existing reserve is moved across by the account each dollar sits in; money not tied to an account stays in the shared reserve.
- **Assign** sends each account's share of the tax cut to that account's pocket, in proportion to the cash the account holds, and tags it to that account. Paybacks of reserve draws are split the same way.
- **Cover from reserves** takes its Taxes share from the account pockets in proportion to what each holds.
- Estimated tax payments still just spend from a tax pocket, so reports count them as tax payments as before.
- **Combine into one reserve** moves everything back and retires the extra pockets (blocked while one is overspent).
- No schema change: a split pocket is an app-managed pocket that is "paid from" one account (`lib/budget/tax-split.ts`).

### Loans already paid up this month
If a loan's first payment in the app is **next month** (because this month's was paid before you entered it), its pocket now shows the monthly payment and due day right away, with this month marked paid. Loans starting further out still show nothing until their first payment month.

## Cash vs debit vs credit, credit limits, mobile date fix
- Accounts page is grouped: Cash in hand (Cash accounts), Bank accounts (checking/savings = debit), Credit cards. Account pickers (add transaction, quick add, transfer) show "(cash)", "(debit)" or "(credit card)" next to the name.
- Credit limit per card (card page > "Limit, dates, interest rate & minimum payment"). New table `credit_limits` (migration 20261005320000, RLS on). The Accounts page shows a "Credit used" bar per card plus a combined bar; green under 30%, amber 50-80%, red above 80%. Pages still work before the SQL is run (no bars until then).
- Date inputs no longer push past the right edge of dialogs on phones (global `input[type=date].input` + grid `min-width:0`).

## Pay card or loan from the + button
"+" menu > **Pay card or loan**. Pick the card or loan, the account you pay from, amount and date. Cards: money moves from the account to the card (a transfer, no pocket changes). Loans: the payment comes out of the account, counts in the loan's pocket (so the pocket shows paid), and the balance owed drops by the principal part (defaults to payment minus a month of interest; editable). "Pay it all off" fills the full balance.

## Credit cards no longer reduce Ready to assign
What you owe on a credit card (its starting balance, and payments to it) is left out of Ready to assign and the per-account cash pools. The debt is covered from the pockets that spent it (see the card's "set aside" status). When Ready to assign is negative, the budget header now names the accounts that were assigned more than they hold.

## Credit card payment plan
Each card with a statement day gets a plan (lib/budget/card-plan.ts): pay down 2 days BEFORE the statement closes, aiming to report under 9% of the credit limit (everything owed if no limit is set), then pay the rest by the due date. Reminders show on the Budget and Accounts pages from 5 days ahead, the card page has a "Payment plan" box, and the bills calendar gets a "Pay down <card>" day. There are no push or email notifications yet; reminders are in the app.

## Add transaction dialogs, header, appearance
- Dialogs scroll inside themselves (header and Save stay visible). Add transaction shows only the essentials (direction, amount, date, payee, account, pocket); memo, who, tags, receipt and cleared are under "More".
- Phone header: the WaiWai wordmark hides below 380px wide so the account icon is never cut off.
- Appearance (account menu): Light, Dark, or Device (follows the phone/computer setting, including when it switches automatically).

## Recurring transactions
`/recurring` (Accounts > Recurring). Set up anything that repeats (weekly, every 2 weeks, monthly, every 3 months, yearly). Each item either posts itself when due ("Post it automatically") or waits on the Budget page and Recurring page for a tap (Post / Change amount / Skip). Missed dates catch up. Also: "Repeat" under More when adding a transaction, and "Looks like these repeat" suggests ones found in the last 14 months. Auto items post when the Budget or Recurring page opens (no background job needed). Table `recurring_items` (migration 20261005330000); the app works before the SQL is run.

## Bank file import (OFX / QFX / QBO)
Import page accepts the file your bank (or QuickBooks) lets you download, not just CSV. Rows load the same way as CSV, with the bank's own statement balance shown and a link to Balance check. Rows with the same amount within 3 days of something you already typed in are marked "Already entered" and skipped (untick to import them anyway). Re-importing the same file is still safe.

## 60-day cash forecast

Accounts > **Forecast** (also a chip on the Budget page). Starts from the cash in your on-budget bank and cash accounts and walks 60 days forward using what is already known: repeating items (Recurring), bills with a due day, loan payments, anything already dated in the future, and credit card payments following the card plan (pay down before the statement closes, the rest by the due date). A name that appears in two places (a bill and a repeating item) is counted once. Everyday spending that isn't repeating is not predicted. The Budget page shows a red strip when cash is projected to run short in the next 30 days. Code: `lib/forecast-math.ts` (+test), `lib/forecast.ts`.

## Push reminders

Settings > Reminders > **Turn on reminders** on each phone or computer (on iPhone, add WaiWai to the Home Screen first). Once a day (8:00 Hawaii) `netlify/functions/daily-reminders.mts` calls `POST /api/cron/notify`, which posts repeating items that post themselves and sends one notification per person with anything new: card pay-down (5 days ahead and on the day), card payment due, bills and loan payments (3 days ahead and on the day), repeating items waiting for a tap, and cash forecast to run short within 14 days. Each reminder is sent once (`push_sent`). `?dry=1` lists what would be sent.

Setup: run `prisma/migrations/20261005340000_push_reminders/migration.sql` in Supabase, then add these Netlify environment variables and redeploy: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (make a pair with `npx web-push generate-vapid-keys`), `CRON_SECRET` (any random string of 16+ characters), optionally `VAPID_SUBJECT` (`mailto:you@example.com`).

## Home screen and calm tone
- `/home` is the first tab: greeting, cash on hand, "What's going well" (only true facts), "Looking ahead" (money in first), and "Your next steps" with a button each. Import lives in the account menu.
- Wording rule everywhere: benefit first, how much time there is, a way to do it. No "overdue", "warning", "short" or "urgent". Overdue bills read "Waiting for you"; a cash gap reads "a $X gap to plan for around DATE" with options. Red is kept for real recorded overspending only.
- Morning push: one message a day, titled "Good morning, <name>", leading with a good line when there is one.
- Quiet mode (Settings > Reminders): pause 1 day, 3 days or 1 week, or resume. Needs `prisma/migrations/20261005350000_push_quiet_mode/migration.sql` (new table `push_prefs`). Paused days send nothing and lose nothing.

## Importing with your bank's categories
- A `Category` column in a bank CSV is read. On the Import screen each distinct bank category (money out only) is mapped to a pocket: clear name matches are filled in, you can change any of them, and "Use suggestion" falls back to auto-categorize (your history, then built-in vendor rules).
- Order per row: your manual pick, then the file's category, then the suggestion. Transfers, "Uncategorized", revenue and refunds are never auto-mapped; those rows are left in review.
- Import only adds new rows. It never edits existing transactions, payees or pockets, and rows that look already entered (same amount within 3 days) are skipped by default.

## Going through a year (History → "Go through 20XX transactions")

Each year card on the History page links to `/history/review?year=…`. Every transaction in that year is grouped by payee and direction (money in / money out), biggest first. Change a group's type and all of its rows for that year follow; open a group to fix single rows. Choices: any income or expense type, "Exclude (transfer or not business)", or "Guess again from the wording". Tabs filter to money in, money out, transfers or rows that still need a type. "Mark year as reviewed" is remembered (table `history_reviews`, migration `20261005360000_history_reviews`). Sealed years are read-only. Logic lives in `lib/history-review.ts` (tested).
