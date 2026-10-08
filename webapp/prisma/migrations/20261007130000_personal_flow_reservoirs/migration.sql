-- A fourth bucket on the Personal flow: Reservoirs (0% until chosen, so nothing changes for existing setups).
ALTER TABLE "personal_flow_configs" ADD COLUMN "reserveBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "personal_flow_configs" ADD COLUMN "reserveGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
