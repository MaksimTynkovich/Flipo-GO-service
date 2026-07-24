-- Roulette house bank + auto-recovery settings (admin-tunable).

ALTER TABLE platform_risk_settings
    ADD COLUMN IF NOT EXISTS roulette_recovery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS roulette_recovery_active BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS roulette_bank_nanoton BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS roulette_loss_threshold_nanoton BIGINT NOT NULL DEFAULT -50000000000,
    ADD COLUMN IF NOT EXISTS roulette_recovery_target_nanoton BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS roulette_recovery_bias_weight INT NOT NULL DEFAULT 50;
