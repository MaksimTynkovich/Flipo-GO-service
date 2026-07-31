ALTER TABLE case_live_feed_settings
    DROP COLUMN IF EXISTS common_max_nanoton,
    DROP COLUMN IF EXISTS uncommon_max_nanoton,
    DROP COLUMN IF EXISTS rare_max_nanoton,
    DROP COLUMN IF EXISTS epic_max_nanoton;
