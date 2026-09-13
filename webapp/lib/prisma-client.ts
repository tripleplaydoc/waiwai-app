import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// As of Prisma 7, PrismaClient no longer reads a connection URL implicitly
// from schema.prisma — it must be given a driver adapter explicitly. This
// uses DATABASE_URL (Supabase's pooled connection), which is what the
// running app should use — see prisma.config.ts for why the CLI uses a
// different (direct) URL instead.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. In Netlify: Site configuration → Environment variables."
  );
}
const adapter = new PrismaPg({ connectionString });

// Standard Next.js dev-mode singleton: without this, hot-reloading in
// development spins up a new PrismaClient (and a new connection pool) on
// every file save, eventually exhausting Postgres's connection limit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
