-- CreateTable
CREATE TABLE "credit_limits" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "limitCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "credit_limits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "credit_limits_accountId_key" ON "credit_limits"("accountId");
ALTER TABLE "credit_limits" ADD CONSTRAINT "credit_limits_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_limits" ENABLE ROW LEVEL SECURITY;
