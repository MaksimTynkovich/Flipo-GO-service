DROP TABLE IF EXISTS platform_withdrawal_settings;

ALTER TABLE users
    DROP COLUMN IF EXISTS withdrawals_disabled;
