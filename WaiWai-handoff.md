# Handoff: WaiWai budgeting app
2026-10-04 · Dr. Mike Okouchi's zero-based envelope budgeting web app. Rounds 1–4 of feature work are pushed; this handoff lets a new chat keep iterating.

## Objective
WaiWai (Hawaiian for "water water" = wealth; water/liquidity theme) is a YNAB-style envelope budgeting app for Personal and Business finances. Mike wants it to look and work well for him and his wife, on desktop and as a phone web app.

## Current state
- All work is pushed to https://github.com/tripleplaydoc/waiwai-app, branch `main`. Latest commit 4365186. Previous: 499798a (round 3), 5ffcf27, 7edad56.
- Repo root is `/home/claude/waiwai-app`. The Next app is in `webapp/`.
- Deployed on Netlify at waiwaiapp.netlify.app. Database is Supabase Postgres (project ref `sljrmufxtkurvqekijnt`). The Netlify build status can't be read from the sandbox, so Mike must check Netlify > Deploys himself.
- Round 3 database migration `20261004120000_avatar_person` (avatars, per-person transactions) was already applied to Supabase. All older transactions were backfilled to the owner (the oldest user) as "who".
- Round 4 (last request) is shipped but only verified in a Chromium test browser, not on a real iPhone:
  - Categories are collapsible (per-device, remembered, plus Collapse all / Expand all).
  - Phone pocket rows show name, a small subline (type, or Due/Overdue/Paid) and the available amount. Tapping the pencil opens the dialog, which now has "Assigned this month", Spent and Available on phones.
  - Account menu was clipped to a sliver by `overflow-x-clip` on the header; removed.
  - "Can I afford it?" renamed "Can I buy this?"
  - "Move money" button removed from Ready to assign. The + menu entry and the tap-on-pocket-balance remain. A hidden `MoveMoneyHost` is still mounted on the budget page so those work.
  - Added `app/manifest.ts`, `app/apple-icon.png`, `public/icon-192.png` and `public/icon-512.png`, and `appleWebApp` metadata, to stop the "pop-up window" behavior on the home-screen app. Mike must delete the old home-screen icon and re-add it after deploy.
  - Phone transaction list on account pages is now cards; the table is desktop-only.
  - Reports date filters sit side by side on phones.
  - Login pages clear the iOS status bar.

## Decisions (and why)
- Terminology: UI "category" = CategoryGroup, UI "pocket" = Category. Expense type is stored in `Category.expenseType` as text (built-in keys, or `CUSTOM:<name>`).
- Envelope engine: append-only BudgetAssignment ledger. Available = cumulative assignments + activity. Moving money writes two offsetting MANUAL rows via `moveMoneyAction`.
- Household: multiple users share all workspaces. The owner is the oldest user. `APP_PASSWORD` is the setup/recovery code and resets only the owner.
- Receipts and avatars are stored in the database and served behind login (`/receipts/[id]`, `/avatar/[id]`).
- Receipt scanner is fully client-side, with no server or third-party service. Files: `lib/scan/geometry.ts` (pure, tested in Node) and `components/receipt-scanner.tsx`. Rendered through a portal with window-capture key handlers, because the outer `Modal` handles Esc and Tab on `document`.
- "Can I buy this?" logic is in `lib/budget/afford.ts` (pure, unit-tested). It suggests borrowing in this order: Ready to assign, free pockets, spare above a bill's monthly cost, goals, then bill money. System and income pockets are excluded.
- On phones the category drag handles are hidden (the chevron takes their place), so category reordering is desktop-only. This was my choice, not requested. Mike hasn't commented.
- Receipt "View" links keep `target="_blank"`. Not changed.
- Phone vs desktop pocket rows are one component with Tailwind responsive classes (`PocketRowView` in `app/budget/budget-board.tsx`).

## Dead ends — do not retry
- `overflow-x-clip` on the sticky header: it fixed the header width on phones but clipped the account dropdown. The fix is `min-w-0` and tighter gaps and padding on the right-hand group, with no overflow clipping.
- React `onChange` on the receipt file input: it ignored re-picking the same file. The input now uses a native `change` listener. Picking the identical file twice in a row still doesn't fire in browsers; accepted.
- Prisma `generate` fails downloading engines in the sandbox. Use the env workaround below.
- Using `:has-text()` in Playwright for ambiguous buttons caused false matches (e.g. "Set password" vs "Reset password"); use `:text-is()`.
- Never `pkill -f <script name>` in the shell: it kills the shell itself if the command text contains the name. Kill servers with `ps aux | grep "[n]ext-server" | awk '{print $2}' | xargs -r kill`.
- Empty commits don't trigger Netlify builds; it only builds on real file changes in `webapp/`.

## Artifacts
- Code: GitHub repo above, `webapp/`. Docs in `webapp/README.md` (updated for scanner, "Can I buy this?", people).
- Nothing else is delivered outside the repo. Scratch test scripts live in `/var/tmp/pw` in the sandbox and are not part of the repo.

## Verbatim essentials
- Stack: Next.js 16.3.8 App Router + Turbopack, React 19, TypeScript, Tailwind v4 (`@theme` tokens such as bg-income, text-water, bg-group), zod 4, lucide-react, dnd-kit, Prisma 7.10 with `@prisma/adapter-pg`.
- Regenerate Prisma client: `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate`
- Typecheck (prints nothing when clean): `npx tsc --noEmit -p . 2>&1 | grep -v "TS5101\|aka.ms"`
- Migrations: apply with `mcp__Supabase__apply_migration` (project_id `sljrmufxtkurvqekijnt`) AND mirror as `webapp/prisma/migrations/<timestamp>_name/migration.sql`. Enable RLS on any new table.
- Auth: scrypt passwords; cookie `ft_session` = `userId.hmac(userId:passwordHash)`. `getCurrentUser` omits `avatarData`.
- Server action body limit: `serverActions.bodySizeLimit: "6mb"`; receipts max 4MB; avatars ≤400KB.
- Local test recipe: initdb in `/var/tmp/ftpg2` (port 5544, socket dir `/var/tmp`, run as `postgres`; `rm -rf` first, then mkdir + chown); apply every `prisma/migrations/*/migration.sql` with psql; then `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 DATABASE_URL=postgresql://postgres@localhost:5544/ft APP_PASSWORD=testsetupcode npx next build && npx next start -p 3111`. First-run setup page is `/setup` (code `testsetupcode`). Playwright is at `/opt/npm-tools/node_modules/playwright` with `executablePath: "/opt/pw-browsers/chromium"`. Stop PG and `rm -rf /var/tmp/ftpg2` when done. Kill the server before dropping the DB.
- Commit trailers required:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01WufP62u2nafCKSQBdvBNwE`
  Push with `git push origin HEAD:main`.
- Mike's last request (round 4), verbatim intent: collapsible categories; on mobile the pockets "just see what's in the pocket and type", with everything else behind the pencil; account tap showed only a sliver; change "Can I afford it?" to "can I buy this?"; remove "move money" from Ready to assign; nav icons opening in a "pop up window instead of just a new window"; "Look through the entire app and just make things look nicer if you were a user."

## Working preferences
- Mike finds Terminal/command-line workflows confusing and prefers GitHub's website over `git push` (from project memory). In practice this session he has accepted me pushing directly; keep telling him where to look (Netlify Deploys) instead of asking him to run commands.
- He wants ready-to-use results, with depth and actionable detail, not instructions.
- Keep his Hawaii/Pacific-time context in mind for timing talk (UTC-10).
- Every user pushback so far was about layout: header must reach the avatar; the pockets must be visible without scrolling (condense the header); the bottom nav sat too close to the phone's bottom edge; the phone pocket list was "sloppy". Treat the phone view as primary: tidy, minimal rows, details behind the pencil.
- Use the app's palette: green for Ready to assign/available, red for overspent, amber for unassigned, indigo/blue for actions, navy chrome, a darker green for the Income header. All financial figures use integer cents and `tabular-nums`.

## Open items
- Next step: ask Mike how the deployed phone version looks on his iPhone after he re-adds the home-screen icon (pocket rows, collapse, account menu, bottom nav height, the "pop up" behavior).
- Then (not requested, only ideas): view receipts in an in-app viewer instead of `target="_blank"`; a way to reorder categories on phones; treat savings-group pockets (e.g. Emergency Fund) as goal-like in "Can I buy this?"; make the floating + button stop covering the pencil on the last visible phone row.
- Blocked: confirming Netlify built commit 4365186 — only Mike can see Netlify Deploys.
- Unverified: real-device iOS safe-area behavior and the scanner on a real receipt photo (tested only with a synthetic skewed PNG).

## Suggested opening prompt
```
I'm continuing work on WaiWai, my envelope budgeting web app (repo: https://github.com/tripleplaydoc/waiwai-app, app in webapp/, deployed on Netlify, Supabase database). Read the attached handoff first, then check git log on main to confirm commit 4365186 is the latest. I've now looked at the phone version and here is my feedback: [paste feedback]. Work on that next, test it in a local build before pushing, and push to main with the commit trailers listed in the handoff.
```
