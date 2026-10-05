-- Credit card statement closing day and payment due day (day of month). Purely additive.
ALTER TABLE "holding_details" ADD COLUMN "statementDay" INTEGER;
ALTER TABLE "holding_details" ADD COLUMN "dueDay" INTEGER;
ALTER TABLE "holding_details" ADD CONSTRAINT "holding_details_cycle_check" CHECK (("statementDay" IS NULL OR ("statementDay" BETWEEN 1 AND 31)) AND ("dueDay" IS NULL OR ("dueDay" BETWEEN 1 AND 31)));
