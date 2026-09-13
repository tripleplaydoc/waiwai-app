import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved CLI-facing connection config out of schema.prisma and into
// this file. Only `generate`, `migrate`, and other CLI commands read this —
// the running app's PrismaClient gets its own connection from the driver
// adapter constructed in lib/prisma.ts, not from here.
//
// Uses DIRECT_URL (the unpooled connection) rather than DATABASE_URL,
// because migrations need a direct connection to the database — Supabase's
// pooler doesn't support the session-level features migrations rely on.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
