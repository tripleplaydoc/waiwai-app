-- Sealed years, and per-year totals by Type for years that only exist as a tax return.
ALTER TABLE "history_settings" ADD COLUMN "sealedThrough" INTEGER;

CREATE TABLE "history_totals" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "typeKey" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "history_totals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "history_totals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "history_totals_workspaceId_year_typeKey_key" ON "history_totals"("workspaceId", "year", "typeKey");
ALTER TABLE "history_totals" ENABLE ROW LEVEL SECURITY;
