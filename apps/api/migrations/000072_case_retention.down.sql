ALTER TABLE user_case_cooldowns
    DROP COLUMN IF EXISTS ready_notified_at;

ALTER TABLE case_catalog_settings
    DROP COLUMN IF EXISTS deposit_boost_enabled,
    DROP COLUMN IF EXISTS deposit_boost_min_nanoton,
    DROP COLUMN IF EXISTS deposit_boost_bias_weight;
