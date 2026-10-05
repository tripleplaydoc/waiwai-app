-- Which bank account each assigned dollar came from (set when income arrives, carried along when money moves).
ALTER TABLE "budget_assignments" ADD COLUMN "fundingAccountId" TEXT;
ALTER TABLE "budget_assignments" ADD CONSTRAINT "budget_assignments_fundingAccountId_fkey"
  FOREIGN KEY ("fundingAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "budget_assignments_fundingAccountId_idx" ON "budget_assignments"("fundingAccountId");
