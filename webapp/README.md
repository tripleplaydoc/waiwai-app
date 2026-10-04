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
- **Receipts** attach to any transaction (photo or PDF, stored in the database, shown behind login only).
- **Move money** between pockets from the + button, the budget page, or by tapping a pocket's available amount.
- A daily rotating verse / saying from `webapp/lib/verses.ts`.
