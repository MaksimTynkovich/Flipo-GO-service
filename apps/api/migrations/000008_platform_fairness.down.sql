DROP TABLE IF EXISTS telegram_bot_settings;
DROP TABLE IF EXISTS promo_codes;
DROP TABLE IF EXISTS admin_audit_logs;
DROP TABLE IF EXISTS provably_fair_seed_sessions;
DROP TABLE IF EXISTS platform_risk_settings;
DROP TABLE IF EXISTS game_configs;

ALTER TABLE ton_transfers
    DROP COLUMN IF EXISTS reviewed_at,
    DROP COLUMN IF EXISTS reviewed_by,
    DROP COLUMN IF EXISTS review_reason,
    DROP COLUMN IF EXISTS risk_flags,
    DROP COLUMN IF EXISTS risk_score;

ALTER TABLE users
    DROP COLUMN IF EXISTS risk_flags,
    DROP COLUMN IF EXISTS is_banned;
