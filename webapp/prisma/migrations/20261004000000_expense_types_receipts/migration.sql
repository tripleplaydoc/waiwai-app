-- Expense/income type per pocket (WaiWai classification, e.g. ADVERTISING, AUTO).
ALTER TABLE "categories" ADD COLUMN "expenseType" TEXT;

-- Receipt files are stored in the database (compressed client-side before upload).
ALTER TABLE "receipts" ADD COLUMN "fileData" BYTEA;
ALTER TABLE "receipts" ADD COLUMN "fileName" TEXT;

-- Give the starter pockets sensible types (only where none is set yet).
UPDATE "categories" SET "expenseType" = 'PAYCHECK' WHERE "type" = 'INCOME' AND "name" = 'Paycheck' AND "expenseType" IS NULL;
UPDATE "categories" SET "expenseType" = 'SALES' WHERE "type" = 'INCOME' AND "name" = 'Business Revenue' AND "expenseType" IS NULL;
UPDATE "categories" SET "expenseType" = CASE "name"
  WHEN 'Rent / Mortgage' THEN 'HOUSING' WHEN 'Utilities' THEN 'UTILITIES' WHEN 'Phone & Internet' THEN 'UTILITIES'
  WHEN 'Insurance' THEN 'INSURANCE' WHEN 'Groceries' THEN 'FOOD' WHEN 'Gas & Transportation' THEN 'TRANSPORT'
  WHEN 'Dining Out' THEN 'DINING' WHEN 'Emergency Fund' THEN 'SAVINGS' END
WHERE "type" = 'EXPENSE' AND "expenseType" IS NULL AND "scheduleCLineItem" IS NULL
  AND "name" IN ('Rent / Mortgage','Utilities','Phone & Internet','Insurance','Groceries','Gas & Transportation','Dining Out','Emergency Fund');
