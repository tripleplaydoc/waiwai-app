-- The four Personal flow shares (Give, Save, Live, Reservoirs) must add up to 100%.
ALTER TABLE personal_flow_configs DROP CONSTRAINT personal_flow_configs_bps_check;
ALTER TABLE personal_flow_configs ADD CONSTRAINT personal_flow_configs_bps_check CHECK ("giveBps" >= 0 AND "saveBps" >= 0 AND "liveBps" >= 0 AND "reserveBps" >= 0 AND ("giveBps" + "saveBps" + "liveBps" + "reserveBps") = 10000);
