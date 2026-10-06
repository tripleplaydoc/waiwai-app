-- CreateTable
CREATE TABLE "recurring_items" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "payee" TEXT NOT NULL,
    "memo" TEXT,
    "amountCents" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL,
    "nextDate" DATE NOT NULL,
    "anchorDay" INTEGER NOT NULL,
    "endDate" DATE,
    "autoPost" BOOLEAN NOT NULL DEFAULT false,
    "isDeductible" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastPostedDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recurring_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recurring_items_workspaceId_isActive_idx" ON "recurring_items"("workspaceId", "isActive");
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_items" ENABLE ROW LEVEL SECURITY;
