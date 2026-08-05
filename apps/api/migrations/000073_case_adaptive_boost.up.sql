ALTER TABLE case_catalog_settings
    ADD COLUMN IF NOT EXISTS deposit_boost_tier1_min_nanoton BIGINT NOT NULL DEFAULT 1000000000,
    ADD COLUMN IF NOT EXISTS deposit_boost_tier2_min_nanoton BIGINT NOT NULL DEFAULT 2000000000,
    ADD COLUMN IF NOT EXISTS deposit_boost_tier3_min_nanoton BIGINT NOT NULL DEFAULT 5000000000,
    ADD COLUMN IF NOT EXISTS deposit_boost_tier4_min_nanoton BIGINT NOT NULL DEFAULT 10000000000,
    ADD COLUMN IF NOT EXISTS deposit_boost_tier1_bias_weight INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deposit_boost_tier2_bias_weight INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS deposit_boost_tier3_bias_weight INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS deposit_boost_tier4_bias_weight INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN IF NOT EXISTS deposit_boost_surplus_share_bps INTEGER NOT NULL DEFAULT 2500,
    ADD COLUMN IF NOT EXISTS deposit_boost_ramp_nanoton BIGINT NOT NULL DEFAULT 10000000000;

UPDATE case_catalog_settings
SET
    deposit_boost_tier1_min_nanoton = COALESCE(NULLIF(deposit_boost_tier1_min_nanoton, 0), 1000000000),
    deposit_boost_tier2_min_nanoton = GREATEST(COALESCE(NULLIF(deposit_boost_tier2_min_nanoton, 0), 2000000000), COALESCE(NULLIF(deposit_boost_tier1_min_nanoton, 0), 1000000000)),
    deposit_boost_tier3_min_nanoton = GREATEST(COALESCE(NULLIF(deposit_boost_tier3_min_nanoton, 0), 5000000000), COALESCE(NULLIF(deposit_boost_tier2_min_nanoton, 0), 2000000000)),
    deposit_boost_tier4_min_nanoton = GREATEST(COALESCE(NULLIF(deposit_boost_tier4_min_nanoton, 0), 10000000000), COALESCE(NULLIF(deposit_boost_tier3_min_nanoton, 0), 5000000000)),
    deposit_boost_tier1_bias_weight = COALESCE(deposit_boost_tier1_bias_weight, 0),
    deposit_boost_tier2_bias_weight = COALESCE(NULLIF(deposit_boost_tier2_bias_weight, 0), 5),
    deposit_boost_tier3_bias_weight = COALESCE(NULLIF(deposit_boost_tier3_bias_weight, 0), 10),
    deposit_boost_tier4_bias_weight = COALESCE(NULLIF(deposit_boost_tier4_bias_weight, 0), 15),
    deposit_boost_surplus_share_bps = COALESCE(NULLIF(deposit_boost_surplus_share_bps, 0), 2500),
    deposit_boost_ramp_nanoton = COALESCE(NULLIF(deposit_boost_ramp_nanoton, 0), 10000000000)
WHERE id = 1;
