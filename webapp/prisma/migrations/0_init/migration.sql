-- ============================================================================
-- Zero-Based Financial Tracker — initial schema (0_init)
-- Hand-generated to match prisma/schema.prisma exactly, in an environment
-- where `prisma migrate dev` couldn't reach the Prisma engine binaries.
--
-- IMPORTANT: once you have this project running normally on a machine with
-- working network access, save this exact content as
-- prisma/migrations/0_init/migration.sql, then run:
--   npx prisma migrate resolve --applied "0_init"
-- That tells Prisma's migration history this migration is already applied
-- to the live database (which it now is), so `prisma migrate dev` going
-- forward diffs from here instead of trying to recreate these tables.
-- ============================================================================

-- ---- ENUMS ----
CREATE TYPE "WorkspaceType" AS ENUM ('PERSONAL', 'BUSINESS');
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT', 'LOAN', 'PROPERTY', 'OTHER_ASSET', 'OTHER_LIABILITY');
CREATE TYPE "BalanceMode" AS ENUM ('TRANSACTION_DERIVED', 'MANUAL');
CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE', 'SYSTEM');
CREATE TYPE "ScheduleCLineItem" AS ENUM ('ADVERTISING', 'CAR_AND_TRUCK', 'COMMISSIONS_AND_FEES', 'CONTRACT_LABOR', 'INSURANCE', 'INTEREST', 'LEGAL_AND_PROFESSIONAL', 'OFFICE_EXPENSE', 'RENT_OR_LEASE', 'REPAIRS_AND_MAINTENANCE', 'SUPPLIES', 'TAXES_AND_LICENSES', 'TRAVEL', 'MEALS', 'UTILITIES', 'WAGES', 'SOFTWARE_AND_SUBSCRIPTIONS', 'OTHER');
CREATE TYPE "ClearedStatus" AS ENUM ('UNCLEARED', 'CLEARED', 'RECONCILED');
CREATE TYPE "AssignmentSource" AS ENUM ('MANUAL', 'AUTO_TAX_RESERVE', 'REBALANCE_TAX_RELEASE', 'ROLLOVER', 'CORRECTION', 'AUTO_WATERFALL');
CREATE TYPE "TaxQuarter" AS ENUM ('Q1', 'Q2', 'Q3', 'Q4');
CREATE TYPE "ImportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "FundingTargetType" AS ENUM ('MONTHLY_FUNDING', 'TARGET_BALANCE', 'TARGET_BALANCE_BY_DATE');
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING_UPLOAD', 'PROCESSING', 'PROCESSED', 'NEEDS_REVIEW', 'FAILED');
CREATE TYPE "SavingsOpportunityStatus" AS ENUM ('NEW', 'DISMISSED', 'ACTED_ON', 'EXPIRED');
CREATE TYPE "RecommendationType" AS ENUM ('CUT_SPENDING', 'INCREASE_ALLOCATION', 'NEW_CATEGORY_SUGGESTION', 'REVENUE_OPPORTUNITY', 'REALLOCATE_PRIORITY', 'CASH_FLOW_WARNING');
CREATE TYPE "RecommendationStatus" AS ENUM ('NEW', 'ACCEPTED', 'DISMISSED', 'EXPIRED');

-- ---- users ----
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- ---- workspaces ----
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkspaceType" NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workspaces_ownerId_idx" ON "workspaces"("ownerId");
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- waterfall_runs (created early: budget_assignments references it) ----
CREATE TABLE "waterfall_runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "remainderCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "waterfall_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "waterfall_runs_workspaceId_month_idx" ON "waterfall_runs"("workspaceId", "month");
ALTER TABLE "waterfall_runs" ADD CONSTRAINT "waterfall_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- category_groups ----
CREATE TABLE "category_groups" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "category_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "category_groups_workspaceId_idx" ON "category_groups"("workspaceId");
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- categories ----
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "categoryGroupId" TEXT,
    "name" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL DEFAULT 'EXPENSE',
    "isTaxDeductible" BOOLEAN NOT NULL DEFAULT false,
    "scheduleCLineItem" "ScheduleCLineItem",
    "isSystemManaged" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "priorityRank" INTEGER,
    "fundingTargetType" "FundingTargetType",
    "fundingTargetCents" INTEGER,
    "fundingTargetByDate" DATE,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "categories_workspaceId_idx" ON "categories"("workspaceId");
CREATE INDEX "categories_workspaceId_type_idx" ON "categories"("workspaceId", "type");
CREATE INDEX "categories_workspaceId_priorityRank_idx" ON "categories"("workspaceId", "priorityRank");
ALTER TABLE "categories" ADD CONSTRAINT "categories_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_categoryGroupId_fkey" FOREIGN KEY ("categoryGroupId") REFERENCES "category_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- tax_profiles ----
CREATE TABLE "tax_profiles" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reserveRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 30.00,
    "reserveCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tax_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tax_profiles_workspaceId_key" ON "tax_profiles"("workspaceId");
CREATE UNIQUE INDEX "tax_profiles_reserveCategoryId_key" ON "tax_profiles"("reserveCategoryId");
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_reserveCategoryId_fkey" FOREIGN KEY ("reserveCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- accounts ----
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "balanceMode" "BalanceMode" NOT NULL DEFAULT 'TRANSACTION_DERIVED',
    "onBudget" BOOLEAN NOT NULL DEFAULT true,
    "openingBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "openingBalanceDate" DATE,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "accounts_workspaceId_idx" ON "accounts"("workspaceId");
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- manual_balance_entries ----
CREATE TABLE "manual_balance_entries" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "manual_balance_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "manual_balance_entries_accountId_asOfDate_idx" ON "manual_balance_entries"("accountId", "asOfDate");
ALTER TABLE "manual_balance_entries" ADD CONSTRAINT "manual_balance_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- payees ----
CREATE TABLE "payees" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultCategoryId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payees_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payees_workspaceId_name_key" ON "payees"("workspaceId", "name");
CREATE INDEX "payees_workspaceId_idx" ON "payees"("workspaceId");
ALTER TABLE "payees" ADD CONSTRAINT "payees_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payees" ADD CONSTRAINT "payees_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- import_batches ----
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedRowCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateRowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "import_batches_workspaceId_idx" ON "import_batches"("workspaceId");
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- transactions ----
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "payeeId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "memo" TEXT,
    "clearedStatus" "ClearedStatus" NOT NULL DEFAULT 'UNCLEARED',
    "flagColor" TEXT,
    "isTaxDeductible" BOOLEAN NOT NULL DEFAULT false,
    "transferGroupId" TEXT,
    "transferAccountId" TEXT,
    "importBatchId" TEXT,
    "importHash" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transactions_accountId_importHash_key" ON "transactions"("accountId", "importHash");
CREATE INDEX "transactions_workspaceId_date_idx" ON "transactions"("workspaceId", "date");
CREATE INDEX "transactions_accountId_date_idx" ON "transactions"("accountId", "date");
CREATE INDEX "transactions_categoryId_idx" ON "transactions"("categoryId");
CREATE INDEX "transactions_transferGroupId_idx" ON "transactions"("transferGroupId");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "payees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transferAccountId_fkey" FOREIGN KEY ("transferAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- budget_assignments ----
CREATE TABLE "budget_assignments" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "source" "AssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "relatedTransactionId" TEXT,
    "waterfallRunId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "budget_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "budget_assignments_categoryId_month_idx" ON "budget_assignments"("categoryId", "month");
CREATE INDEX "budget_assignments_waterfallRunId_idx" ON "budget_assignments"("waterfallRunId");
ALTER TABLE "budget_assignments" ADD CONSTRAINT "budget_assignments_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budget_assignments" ADD CONSTRAINT "budget_assignments_relatedTransactionId_fkey" FOREIGN KEY ("relatedTransactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "budget_assignments" ADD CONSTRAINT "budget_assignments_waterfallRunId_fkey" FOREIGN KEY ("waterfallRunId") REFERENCES "waterfall_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- transaction_splits ----
CREATE TABLE "transaction_splits" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "memo" TEXT,
    "isTaxDeductible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "transaction_splits_transactionId_idx" ON "transaction_splits"("transactionId");
CREATE INDEX "transaction_splits_categoryId_idx" ON "transaction_splits"("categoryId");
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- tax_payments ----
CREATE TABLE "tax_payments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "quarter" "TaxQuarter" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidDate" DATE NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "relatedTransactionId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tax_payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tax_payments_relatedTransactionId_key" ON "tax_payments"("relatedTransactionId");
CREATE UNIQUE INDEX "tax_payments_workspaceId_taxYear_quarter_key" ON "tax_payments"("workspaceId", "taxYear", "quarter");
CREATE INDEX "tax_payments_workspaceId_idx" ON "tax_payments"("workspaceId");
ALTER TABLE "tax_payments" ADD CONSTRAINT "tax_payments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tax_payments" ADD CONSTRAINT "tax_payments_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_payments" ADD CONSTRAINT "tax_payments_relatedTransactionId_fkey" FOREIGN KEY ("relatedTransactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- receipts ----
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "transactionId" TEXT,
    "fileStorageKey" TEXT NOT NULL,
    "fileUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "merchantName" TEXT,
    "merchantRaw" TEXT,
    "purchaseDate" DATE,
    "subtotalCents" INTEGER,
    "taxCents" INTEGER,
    "tipCents" INTEGER,
    "totalCents" INTEGER,
    "ocrRawResponse" JSONB,
    "ocrConfidence" DECIMAL(4,3),
    "ocrProvider" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "receipts_transactionId_key" ON "receipts"("transactionId");
CREATE INDEX "receipts_workspaceId_idx" ON "receipts"("workspaceId");
CREATE INDEX "receipts_workspaceId_status_idx" ON "receipts"("workspaceId", "status");
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- products ----
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "upc" TEXT,
    "categoryId" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "products_workspaceId_name_key" ON "products"("workspaceId", "name");
CREATE INDEX "products_workspaceId_idx" ON "products"("workspaceId");
ALTER TABLE "products" ADD CONSTRAINT "products_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- receipt_line_items ----
CREATE TABLE "receipt_line_items" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "rawDescription" TEXT NOT NULL,
    "normalizedName" TEXT,
    "productId" TEXT,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER,
    "totalCents" INTEGER NOT NULL,
    "categoryId" TEXT,
    "isTaxDeductible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "receipt_line_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "receipt_line_items_receiptId_idx" ON "receipt_line_items"("receiptId");
CREATE INDEX "receipt_line_items_productId_idx" ON "receipt_line_items"("productId");
ALTER TABLE "receipt_line_items" ADD CONSTRAINT "receipt_line_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receipt_line_items" ADD CONSTRAINT "receipt_line_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receipt_line_items" ADD CONSTRAINT "receipt_line_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- savings_opportunities ----
CREATE TABLE "savings_opportunities" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT,
    "lineItemId" TEXT,
    "itemDescription" TEXT NOT NULL,
    "paidPriceCents" INTEGER NOT NULL,
    "paidAtMerchant" TEXT,
    "paidAtDate" DATE NOT NULL,
    "suggestedSource" TEXT NOT NULL,
    "suggestedPriceCents" INTEGER NOT NULL,
    "suggestedUrl" TEXT,
    "estimatedSavingsCents" INTEGER NOT NULL,
    "analysisMethod" TEXT NOT NULL,
    "confidence" DECIMAL(4,3),
    "evidenceNote" TEXT,
    "status" "SavingsOpportunityStatus" NOT NULL DEFAULT 'NEW',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "savings_opportunities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "savings_opportunities_workspaceId_status_idx" ON "savings_opportunities"("workspaceId", "status");
ALTER TABLE "savings_opportunities" ADD CONSTRAINT "savings_opportunities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "savings_opportunities" ADD CONSTRAINT "savings_opportunities_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "savings_opportunities" ADD CONSTRAINT "savings_opportunities_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "receipt_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- budget_recommendations ----
CREATE TABLE "budget_recommendations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "RecommendationType" NOT NULL,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "suggestedChangeCents" INTEGER,
    "projectedImpactCents" INTEGER,
    "analysisMethod" TEXT NOT NULL,
    "confidence" DECIMAL(4,3),
    "status" "RecommendationStatus" NOT NULL DEFAULT 'NEW',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "budget_recommendations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "budget_recommendations_workspaceId_status_idx" ON "budget_recommendations"("workspaceId", "status");
CREATE INDEX "budget_recommendations_workspaceId_type_idx" ON "budget_recommendations"("workspaceId", "type");
ALTER TABLE "budget_recommendations" ADD CONSTRAINT "budget_recommendations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_recommendations" ADD CONSTRAINT "budget_recommendations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- cashflow_forecasts ----
CREATE TABLE "cashflow_forecasts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "projectedIncomeCents" INTEGER NOT NULL,
    "projectedExpenseCents" INTEGER NOT NULL,
    "projectedEndingBalanceCents" INTEGER NOT NULL,
    "lowestProjectedBalanceCents" INTEGER NOT NULL,
    "lowestBalanceDate" DATE,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cashflow_forecasts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cashflow_forecasts_workspaceId_asOfDate_horizonDays_key" ON "cashflow_forecasts"("workspaceId", "asOfDate", "horizonDays");
ALTER TABLE "cashflow_forecasts" ADD CONSTRAINT "cashflow_forecasts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- net_worth_snapshots ----
CREATE TABLE "net_worth_snapshots" (
    "id" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "totalAssetsCents" INTEGER NOT NULL,
    "totalLiabilitiesCents" INTEGER NOT NULL,
    "netWorthCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "net_worth_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "net_worth_snapshots_asOfDate_key" ON "net_worth_snapshots"("asOfDate");
