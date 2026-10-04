-- Profile pictures (small JPEGs, resized in the browser) and "who made this transaction".
ALTER TABLE "users" ADD COLUMN "avatarData" BYTEA;
ALTER TABLE "users" ADD COLUMN "avatarMime" TEXT;

ALTER TABLE "transactions" ADD COLUMN "personId" TEXT;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "transactions_personId_idx" ON "transactions"("personId");
-- Everything entered so far was the owner's.
UPDATE "transactions" SET "personId" = (SELECT "id" FROM "users" ORDER BY "createdAt" ASC LIMIT 1) WHERE "personId" IS NULL;
