ALTER TABLE platform_withdrawal_settings
    ADD COLUMN IF NOT EXISTS gifts_manual BOOLEAN NOT NULL DEFAULT false;
