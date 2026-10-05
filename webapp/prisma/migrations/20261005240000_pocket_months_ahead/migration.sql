-- Monthly-cost pockets can keep this many extra months of their cost on hand beyond the current month (0 = this month only).
ALTER TABLE "categories" ADD COLUMN "monthsAhead" INTEGER NOT NULL DEFAULT 0;
