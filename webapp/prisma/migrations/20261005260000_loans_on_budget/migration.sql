-- Loans on the budget: first payment date on loan terms, and the budget pocket that pays a loan.
ALTER TABLE "holding_details" ADD COLUMN "firstPaymentDate" DATE;
ALTER TABLE "categories" ADD COLUMN "loanAccountId" TEXT;
CREATE UNIQUE INDEX "categories_loanAccountId_key" ON "categories"("loanAccountId");
ALTER TABLE "categories" ADD CONSTRAINT "categories_loanAccountId_fkey" FOREIGN KEY ("loanAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
