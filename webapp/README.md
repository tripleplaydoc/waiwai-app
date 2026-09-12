# Financial Tracker

Zero-based budgeting app — Personal + Business workspaces, priority-waterfall
envelope funding, receipt scanning, and savings/cashflow analysis. Built with
Next.js (App Router), Prisma, and Supabase Postgres.

## Status

This is early-stage: the data model and the priority-waterfall auto-assign
engine are built and the database is live. There is no budget UI yet — `/`
is a deployment status page that confirms the database connection works.

## Local setup

1. `npm install` (this also runs `prisma generate` via postinstall)
2. Copy `.env.example` to `.env` and fill in the real `DATABASE_URL` /
   `DIRECT_URL` — get the password from the Supabase dashboard:
   Project Settings → Database → Connection string (project ref
   `sljrmufxtkurvqekijnt`).
3. `npm run dev`

## Database

The schema lives in `prisma/schema.prisma`. The initial migration
(`prisma/migrations/0_init/migration.sql`) has already been applied directly
to the live Supabase database. Once you can run Prisma's CLI normally (this
was built in a network-restricted sandbox that couldn't reach Prisma's
engine binaries), baseline your local migration history against it:

```
npx prisma migrate resolve --applied "0_init"
```

From then on, `npx prisma migrate dev` will diff from this point forward
instead of trying to recreate these tables.

## Deploying

See `netlify.toml`. Required environment variables in Netlify's site
settings (Site configuration → Environment variables): `DATABASE_URL`,
`DIRECT_URL`.

## Known open item

Row Level Security is disabled on all tables in Supabase (flagged as a
critical advisory). Not currently exploitable — this app talks to Postgres
through Prisma's direct connection, not Supabase's client-side SDK/anon key
— but worth deciding on deliberately (enable RLS + policies) before adding
anything that does use the anon key client-side (Storage, Realtime, etc.).
