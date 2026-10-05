-- Coins/shares priced from live markets, plus loan terms, vehicle info and cost basis per holding.
-- Purely additive.

CREATE TYPE "PositionKind" AS ENUM ('CRYPTO', 'STOCK');

CREATE TABLE "holding_details" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "costBasisCents" INTEGER,
  "purchaseDate" DATE,
  "notes" TEXT,
  "cashCents" INTEGER NOT NULL DEFAULT 0,
  "linkedLoanId" TEXT,
  "interestRateBps" INTEGER,
  "termMonths" INTEGER,
  "originalAmountCents" INTEGER,
  "loanStartDate" DATE,
  "vin" TEXT,
  "vehicleYear" INTEGER,
  "vehicleMake" TEXT,
  "vehicleModel" TEXT,
  "vehicleTrim" TEXT,
  "mileage" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "holding_details_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "holding_details_check" CHECK (
    ("costBasisCents" IS NULL OR "costBasisCents" >= 0) AND "cashCents" >= 0
    AND ("interestRateBps" IS NULL OR ("interestRateBps" >= 0 AND "interestRateBps" <= 10000))
    AND ("termMonths" IS NULL OR "termMonths" > 0)
    AND ("originalAmountCents" IS NULL OR "originalAmountCents" >= 0)
    AND ("mileage" IS NULL OR "mileage" >= 0)
  )
);
CREATE UNIQUE INDEX "holding_details_accountId_key" ON "holding_details"("accountId");
ALTER TABLE "holding_details" ADD CONSTRAINT "holding_details_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "holding_details" ADD CONSTRAINT "holding_details_linkedLoanId_fkey" FOREIGN KEY ("linkedLoanId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "holding_details" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "holding_positions" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "kind" "PositionKind" NOT NULL,
  "symbol" TEXT NOT NULL,
  "name" TEXT,
  "quantity" DECIMAL(30,12) NOT NULL,
  "costBasisCents" INTEGER,
  "lastPrice" DECIMAL(30,12),
  "priceAt" TIMESTAMP(3),
  "priceSource" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "holding_positions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "holding_positions_check" CHECK ("quantity" >= 0 AND ("costBasisCents" IS NULL OR "costBasisCents" >= 0) AND ("lastPrice" IS NULL OR "lastPrice" >= 0))
);
CREATE UNIQUE INDEX "holding_positions_accountId_kind_symbol_key" ON "holding_positions"("accountId", "kind", "symbol");
CREATE INDEX "holding_positions_accountId_idx" ON "holding_positions"("accountId");
ALTER TABLE "holding_positions" ADD CONSTRAINT "holding_positions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "holding_positions" ENABLE ROW LEVEL SECURITY;
