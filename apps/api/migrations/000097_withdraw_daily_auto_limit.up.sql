ALTER TABLE platform_withdrawal_settings
    ADD COLUMN IF NOT EXISTS auto_withdraw_daily_limit_nanoton BIGINT NOT NULL DEFAULT 0;
