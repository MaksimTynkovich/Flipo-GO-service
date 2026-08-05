ALTER TABLE case_catalog_settings
    DROP COLUMN IF EXISTS deposit_boost_tier1_min_nanoton,
    DROP COLUMN IF EXISTS deposit_boost_tier2_min_nanoton,
    DROP COLUMN IF EXISTS deposit_boost_tier3_min_nanoton,
    DROP COLUMN IF EXISTS deposit_boost_tier4_min_nanoton,
    DROP COLUMN IF EXISTS deposit_boost_tier1_bias_weight,
    DROP COLUMN IF EXISTS deposit_boost_tier2_bias_weight,
    DROP COLUMN IF EXISTS deposit_boost_tier3_bias_weight,
    DROP COLUMN IF EXISTS deposit_boost_tier4_bias_weight,
    DROP COLUMN IF EXISTS deposit_boost_surplus_share_bps,
    DROP COLUMN IF EXISTS deposit_boost_ramp_nanoton;
