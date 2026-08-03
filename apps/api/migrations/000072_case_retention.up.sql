ALTER TABLE user_case_cooldowns
    ADD COLUMN IF NOT EXISTS ready_notified_at TIMESTAMPTZ;

ALTER TABLE case_catalog_settings
    ADD COLUMN IF NOT EXISTS deposit_boost_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS deposit_boost_min_nanoton BIGINT NOT NULL DEFAULT 10000000000,
    ADD COLUMN IF NOT EXISTS deposit_boost_bias_weight INTEGER NOT NULL DEFAULT 40;

UPDATE case_catalog_settings
SET
    deposit_boost_enabled = TRUE,
    deposit_boost_min_nanoton = COALESCE(NULLIF(deposit_boost_min_nanoton, 0), 10000000000),
    deposit_boost_bias_weight = COALESCE(NULLIF(deposit_boost_bias_weight, 0), 40)
WHERE id = 1;
