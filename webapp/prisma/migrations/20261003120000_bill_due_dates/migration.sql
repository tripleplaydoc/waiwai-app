-- Due day per pocket + per-month "paid" markers.
ALTER TABLE "categories" ADD COLUMN "dueDay" INTEGER;
ALTER TABLE "categories" ADD CONSTRAINT "categories_dueDay_check" CHECK ("dueDay" IS NULL OR ("dueDay" >= 1 AND "dueDay" <= 31));

CREATE TABLE "bill_payments" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "month" DATE NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bill_payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bill_payments_categoryId_month_key" ON "bill_payments"("categoryId", "month");
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bill_payments" ENABLE ROW LEVEL SECURITY;
