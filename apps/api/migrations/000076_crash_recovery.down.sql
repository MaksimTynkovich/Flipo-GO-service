ALTER TABLE platform_risk_settings
    DROP COLUMN IF EXISTS crash_recovery_enabled,
    DROP COLUMN IF EXISTS crash_recovery_active,
    DROP COLUMN IF EXISTS crash_bank_nanoton,
    DROP COLUMN IF EXISTS crash_loss_threshold_nanoton,
    DROP COLUMN IF EXISTS crash_recovery_target_nanoton,
    DROP COLUMN IF EXISTS crash_recovery_bias_weight;
