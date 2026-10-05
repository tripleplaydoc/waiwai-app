-- The bank account a pocket is usually paid from. Adding money to the pocket and the automatic Assign buttons take from it first.
ALTER TABLE "categories" ADD COLUMN "paidFromAccountId" TEXT;
ALTER TABLE "categories" ADD CONSTRAINT "categories_paidFromAccountId_fkey"
  FOREIGN KEY ("paidFromAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "categories_paidFromAccountId_idx" ON "categories"("paidFromAccountId");
