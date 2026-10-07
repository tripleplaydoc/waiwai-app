-- Asset pockets: a pocket can feed an asset and track that asset's value against a goal. New nullable columns only.
ALTER TABLE "categories" ADD COLUMN "assetAccountId" TEXT;
ALTER TABLE "categories" ADD COLUMN "assetGoalCents" INTEGER;
CREATE UNIQUE INDEX "categories_assetAccountId_key" ON "categories"("assetAccountId");
ALTER TABLE "categories" ADD CONSTRAINT "categories_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
