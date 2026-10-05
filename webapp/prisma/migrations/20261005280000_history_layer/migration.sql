-- History layer: past years live in their own tables and never touch balances, Ready to Assign, pockets or net worth.
CREATE TABLE "history_settings" (
  "workspaceId" TEXT NOT NULL,
  "goLiveDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "history_settings_pkey" PRIMARY KEY ("workspaceId"),
  CONSTRAINT "history_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "history_accounts" (
  "accountId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "startDate" DATE,
  "startBalanceCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "history_accounts_pkey" PRIMARY KEY ("accountId"),
  CONSTRAINT "history_accounts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "history_accounts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "history_accounts_workspaceId_idx" ON "history_accounts"("workspaceId");

CREATE TABLE "historical_transactions" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "payee" TEXT NOT NULL DEFAULT '',
  "memo" TEXT NOT NULL DEFAULT '',
  "kind" TEXT NOT NULL,
  "typeKey" TEXT,
  "isTaxDeductible" BOOLEAN NOT NULL DEFAULT false,
  "importHash" TEXT NOT NULL,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "historical_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "historical_transactions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "historical_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "historical_transactions_importHash_key" ON "historical_transactions"("importHash");
CREATE INDEX "historical_transactions_workspaceId_date_idx" ON "historical_transactions"("workspaceId", "date");
CREATE INDEX "historical_transactions_accountId_date_idx" ON "historical_transactions"("accountId", "date");
CREATE INDEX "historical_transactions_workspaceId_typeKey_idx" ON "historical_transactions"("workspaceId", "typeKey");

-- Your go-live day (Oct 5, 2026) for every workspace.
INSERT INTO "history_settings" ("workspaceId", "goLiveDate", "updatedAt")
SELECT "id", DATE '2026-10-05', CURRENT_TIMESTAMP FROM "workspaces"
ON CONFLICT ("workspaceId") DO NOTHING;
