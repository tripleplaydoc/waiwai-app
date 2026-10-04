-- Percentage allocation: categories (groups) get a share of income, pockets
-- get a share of their category. Basis points: 10000 = 100%.
ALTER TABLE "category_groups" ADD COLUMN "allocationBps" INTEGER;
ALTER TABLE "categories" ADD COLUMN "allocationBps" INTEGER;
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_allocationBps_check" CHECK ("allocationBps" IS NULL OR ("allocationBps" >= 0 AND "allocationBps" <= 10000));
ALTER TABLE "categories" ADD CONSTRAINT "categories_allocationBps_check" CHECK ("allocationBps" IS NULL OR ("allocationBps" >= 0 AND "allocationBps" <= 10000));
ALTER TYPE "AssignmentSource" ADD VALUE IF NOT EXISTS 'AUTO_PERCENT';
