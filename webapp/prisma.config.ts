import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 keeps CLI connection settings here instead of schema.prisma.
//
// IMPORTANT: `prisma generate` runs automatically on every install/build
// (see the postinstall script) and it does NOT need a real database. The old
// version of this file used env("DIRECT_URL"), which throws when the variable
// is missing, so a missing DIRECT_URL killed the whole Netlify build. This
// version falls back to DATABASE_URL, then to a harmless placeholder, so
// building never depends on database settings. Migrations (`prisma migrate`)
// still need a real DIRECT_URL, which is why it is preferred when present.
const url =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
