-- Cashflow waterfall, expense tags + monthly review, assets & liabilities detail.
-- Purely additive: the previously deployed app keeps working while this is applied.

CREATE TYPE "ExpenseTag" AS ENUM ('CULTIVATE', 'PRESERVE', 'SUPPORT', 'REGENERATE', 'LEAKAGE');
CREATE TYPE "ReviewAnswer" AS ENUM ('YES', 'NO', 'UNSURE');
CREATE TYPE "StrategicValue" AS ENUM ('CAPACITY', 'RISK', 'STRENGTH');
CREATE TYPE "HoldingClass" AS ENUM ('CASH_SAVINGS', 'STOCKS_FUNDS', 'REAL_ESTATE', 'BUSINESS', 'VEHICLE', 'OTHER_ASSET', 'MORTGAGE', 'STUDENT_LOAN', 'CAR_LOAN', 'CREDIT_CARD', 'BANK_LOAN', 'OTHER_LIABILITY');
CREATE TYPE "IncomeKind" AS ENUM ('EARNED', 'PORTFOLIO', 'PASSIVE');
CREATE TYPE "ReserveBucket" AS ENUM ('TAXES', 'RESERVOIR_1', 'RESERVOIR_2');
ALTER TYPE "AssignmentSource" ADD VALUE IF NOT EXISTS 'WATERFALL';
ALTER TYPE "AssignmentSource" ADD VALUE IF NOT EXISTS 'WATERFALL_COVER';

-- Accounts: asset/liability class and the monthly income (asset) or payment (liability) it carries.
ALTER TABLE "accounts" ADD COLUMN "holdingClass" "HoldingClass";
ALTER TABLE "accounts" ADD COLUMN "monthlyCashflowCents" INTEGER;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_monthlyCashflowCents_check" CHECK ("monthlyCashflowCents" IS NULL OR "monthlyCashflowCents" >= 0);

-- Pockets: income kind (earned / portfolio / passive) and share of the waterfall's Cash.
ALTER TABLE "categories" ADD COLUMN "incomeKind" "IncomeKind";
ALTER TABLE "categories" ADD COLUMN "cashShareBps" INTEGER;
ALTER TABLE "categories" ADD CONSTRAINT "categories_cashShareBps_check" CHECK ("cashShareBps" IS NULL OR ("cashShareBps" >= 0 AND "cashShareBps" <= 10000));

-- Transactions: spending tags (several allowed).
ALTER TABLE "transactions" ADD COLUMN "tags" "ExpenseTag"[] NOT NULL DEFAULT ARRAY[]::"ExpenseTag"[];

-- Waterfall settings (one row per workspace).
CREATE TABLE "waterfall_configs" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "taxBps" INTEGER NOT NULL DEFAULT 3000,
  "reservoir1Months" DECIMAL(5,2) NOT NULL DEFAULT 3,
  "reservoir2Months" DECIMAL(5,2) NOT NULL DEFAULT 3,
  "reservoir2ShareBps" INTEGER NOT NULL DEFAULT 5000,
  "opexGroupId" TEXT,
  "taxCategoryId" TEXT,
  "reservoir1CategoryId" TEXT,
  "reservoir2CategoryId" TEXT,
  "cashGroupId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "waterfall_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "waterfall_configs_taxBps_check" CHECK ("taxBps" >= 0 AND "taxBps" <= 10000),
  CONSTRAINT "waterfall_configs_reservoir2ShareBps_check" CHECK ("reservoir2ShareBps" >= 0 AND "reservoir2ShareBps" <= 10000),
  CONSTRAINT "waterfall_configs_months_check" CHECK ("reservoir1Months" >= 0 AND "reservoir2Months" >= 0)
);
CREATE UNIQUE INDEX "waterfall_configs_workspaceId_key" ON "waterfall_configs"("workspaceId");
ALTER TABLE "waterfall_configs" ADD CONSTRAINT "waterfall_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waterfall_configs" ENABLE ROW LEVEL SECURITY;

-- Money pulled from a reserve to cover a shortfall (repaid first from incoming money).
CREATE TABLE "reserve_draws" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "bucket" "ReserveBucket" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "repaidCents" INTEGER NOT NULL DEFAULT 0,
  "coveredCategoryId" TEXT,
  "coveredName" TEXT,
  "month" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reserve_draws_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reserve_draws_amount_check" CHECK ("amountCents" > 0 AND "repaidCents" >= 0 AND "repaidCents" <= "amountCents")
);
CREATE INDEX "reserve_draws_workspaceId_createdAt_idx" ON "reserve_draws"("workspaceId", "createdAt");
ALTER TABLE "reserve_draws" ADD CONSTRAINT "reserve_draws_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reserve_draws" ENABLE ROW LEVEL SECURITY;

-- Monthly expense review answers (one per expense).
CREATE TABLE "expense_reviews" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "increasesRevenue" "ReviewAnswer",
  "strategicValue" "StrategicValue"[] NOT NULL DEFAULT ARRAY[]::"StrategicValue"[],
  "stewardship" "ReviewAnswer",
  "notes" TEXT,
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "expense_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "expense_reviews_transactionId_key" ON "expense_reviews"("transactionId");
CREATE INDEX "expense_reviews_workspaceId_idx" ON "expense_reviews"("workspaceId");
ALTER TABLE "expense_reviews" ADD CONSTRAINT "expense_reviews_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_reviews" ADD CONSTRAINT "expense_reviews_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_reviews" ADD CONSTRAINT "expense_reviews_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense_reviews" ENABLE ROW LEVEL SECURITY;
