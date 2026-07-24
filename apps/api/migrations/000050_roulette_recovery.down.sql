ALTER TABLE platform_risk_settings
    DROP COLUMN IF EXISTS roulette_recovery_enabled,
    DROP COLUMN IF EXISTS roulette_recovery_active,
    DROP COLUMN IF EXISTS roulette_bank_nanoton,
    DROP COLUMN IF EXISTS roulette_loss_threshold_nanoton,
    DROP COLUMN IF EXISTS roulette_recovery_target_nanoton,
    DROP COLUMN IF EXISTS roulette_recovery_bias_weight;
