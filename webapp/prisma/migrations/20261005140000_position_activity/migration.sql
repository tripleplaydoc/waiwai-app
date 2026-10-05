-- History of shares/coins added to a position (bought more, reinvested dividends). Purely additive.
CREATE TYPE "PositionActivityKind" AS ENUM ('BOUGHT', 'REINVESTED');

CREATE TABLE "position_activity" (
  "id" TEXT NOT NULL,
  "positionId" TEXT NOT NULL,
  "kind" "PositionActivityKind" NOT NULL,
  "date" DATE NOT NULL,
  "shares" DECIMAL(30,12) NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "position_activity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "position_activity_check" CHECK ("shares" > 0 AND "amountCents" >= 0)
);
CREATE INDEX "position_activity_positionId_date_idx" ON "position_activity"("positionId", "date");
ALTER TABLE "position_activity" ADD CONSTRAINT "position_activity_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "holding_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "position_activity" ENABLE ROW LEVEL SECURITY;
