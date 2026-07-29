ALTER TABLE case_catalog_settings
    DROP COLUMN IF EXISTS bank_recovery_smooth_enabled,
    DROP COLUMN IF EXISTS bank_recovery_drain_opens,
    DROP COLUMN IF EXISTS bank_recovery_relief_opens,
    DROP COLUMN IF EXISTS bank_recovery_relief_max_prize_bps,
    DROP COLUMN IF EXISTS bank_recovery_pace_counter;
