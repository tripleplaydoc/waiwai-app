-- Balance checkpoints: when an account was compared to the bank. New table only; nothing existing changes.
CREATE TABLE "balance_checkpoints" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "bankCents" INTEGER NOT NULL,
  "appCents" INTEGER NOT NULL,
  "gapCents" INTEGER NOT NULL,
  "adjustedCents" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "balance_checkpoints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "balance_checkpoints_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "balance_checkpoints_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "balance_checkpoints_accountId_date_idx" ON "balance_checkpoints"("accountId", "date");
CREATE INDEX "balance_checkpoints_workspaceId_createdAt_idx" ON "balance_checkpoints"("workspaceId", "createdAt");
ALTER TABLE "balance_checkpoints" ENABLE ROW LEVEL SECURITY;
