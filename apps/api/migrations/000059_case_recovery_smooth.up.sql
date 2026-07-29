-- Smooth paid Case Bank recovery: paced drain/relief cycle instead of 100% cheapest.
ALTER TABLE case_catalog_settings
    ADD COLUMN IF NOT EXISTS bank_recovery_smooth_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS bank_recovery_drain_opens INT NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS bank_recovery_relief_opens INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS bank_recovery_relief_max_prize_bps INT NOT NULL DEFAULT 3000,
    ADD COLUMN IF NOT EXISTS bank_recovery_pace_counter INT NOT NULL DEFAULT 0;
