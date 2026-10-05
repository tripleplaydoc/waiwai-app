-- Who looks after each bank account (a household login). Money assigned from an account is attributed to its steward.
ALTER TABLE "accounts" ADD COLUMN "stewardId" TEXT;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_stewardId_fkey"
  FOREIGN KEY ("stewardId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "accounts_stewardId_idx" ON "accounts"("stewardId");
-- Existing accounts start with the household owner (the first login); change any of them from the account's edit dialog.
UPDATE "accounts" SET "stewardId" = (SELECT "id" FROM "users" ORDER BY "createdAt" ASC LIMIT 1);
