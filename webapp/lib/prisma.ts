import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Standard Next.js dev-mode singleton: without this, hot-reloading in
// development spins up a new PrismaClient (and a new connection pool) on
// every file save, eventually exhausting Postgres's connection limit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma 7: PrismaClient requires a driver adapter rather than reading a
// connection string internally. This uses DATABASE_URL (the pooled
// connection) since that's what the running app should use at query time.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
