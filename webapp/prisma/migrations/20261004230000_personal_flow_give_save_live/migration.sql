-- Personal workspace waterfall: Ready to assign splits into Give / Save / Live (adjustable).
-- Purely additive.

ALTER TABLE "categories" ADD COLUMN "flowShareBps" INTEGER;
ALTER TABLE "categories" ADD CONSTRAINT "categories_flowShareBps_check" CHECK ("flowShareBps" IS NULL OR ("flowShareBps" >= 0 AND "flowShareBps" <= 10000));

CREATE TABLE "personal_flow_configs" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "giveBps" INTEGER NOT NULL DEFAULT 2000,
  "saveBps" INTEGER NOT NULL DEFAULT 1000,
  "liveBps" INTEGER NOT NULL DEFAULT 7000,
  "giveGroupIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "saveGroupIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "liveGroupIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "personal_flow_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_flow_configs_bps_check" CHECK ("giveBps" >= 0 AND "saveBps" >= 0 AND "liveBps" >= 0 AND "giveBps" + "saveBps" + "liveBps" = 10000)
);
CREATE UNIQUE INDEX "personal_flow_configs_workspaceId_key" ON "personal_flow_configs"("workspaceId");
ALTER TABLE "personal_flow_configs" ADD CONSTRAINT "personal_flow_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "personal_flow_configs" ENABLE ROW LEVEL SECURITY;
