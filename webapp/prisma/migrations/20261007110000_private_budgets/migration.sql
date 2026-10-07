-- Each person can have their own private Personal budget (SHARED keeps the current household behavior).
ALTER TABLE "users" ADD COLUMN "budgetMode" TEXT NOT NULL DEFAULT 'SHARED';
