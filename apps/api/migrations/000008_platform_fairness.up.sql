-- Platform fairness, risk management, and admin foundation

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS risk_flags JSONB NOT NULL DEFAULT '[]';

ALTER TABLE ton_transfers
    ADD COLUMN IF NOT EXISTS risk_score INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS risk_flags JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS review_reason TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS game_configs (
    game_type VARCHAR(16) PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    min_bet_nanoton BIGINT NOT NULL,
    max_bet_nanoton BIGINT NOT NULL,
    max_payout_nanoton BIGINT NOT NULL,
    house_edge_bps INT NOT NULL,
    rtp_bps INT NOT NULL,
    platform_fee_bps INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_risk_settings (
    id INT PRIMARY KEY DEFAULT 1,
    max_daily_win_nanoton BIGINT NOT NULL,
    max_round_exposure_nanoton BIGINT NOT NULL,
    whale_bet_threshold_nanoton BIGINT NOT NULL,
    auto_review_withdraw_nanoton BIGINT NOT NULL,
    hot_wallet_max_balance_nanoton BIGINT NOT NULL,
    hot_wallet_sweep_threshold_nanoton BIGINT NOT NULL,
    cold_wallet_address VARCHAR(128) NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT platform_risk_settings_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS provably_fair_seed_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_type VARCHAR(16) NOT NULL,
    server_seed_hash VARCHAR(64) NOT NULL,
    server_seed VARCHAR(128),
    client_seed VARCHAR(128) NOT NULL DEFAULT '',
    nonce BIGINT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    rotated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pf_seeds_game_active ON provably_fair_seed_sessions(game_type, active);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(32),
    target_id VARCHAR(128),
    meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS promo_codes (
    code VARCHAR(32) PRIMARY KEY,
    bonus_nanoton BIGINT NOT NULL,
    wager_multiplier DECIMAL(6,2) NOT NULL DEFAULT 1,
    max_uses INT NOT NULL DEFAULT 0,
    used_count INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_bot_settings (
    id INT PRIMARY KEY DEFAULT 1,
    broadcast_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    spam_protection_level INT NOT NULL DEFAULT 1,
    webapp_url VARCHAR(512) NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT telegram_bot_settings_singleton CHECK (id = 1)
);

INSERT INTO game_configs (game_type, enabled, min_bet_nanoton, max_bet_nanoton, max_payout_nanoton, house_edge_bps, rtp_bps, platform_fee_bps)
VALUES
    ('roulette', TRUE, 100000000, 50000000000, 700000000000, 667, 9333, 0),
    ('crash', TRUE, 100000000, 30000000000, 500000000000, 100, 9900, 0),
    ('pvp', TRUE, 100000000, 20000000000, 400000000000, 0, 9500, 500)
ON CONFLICT (game_type) DO NOTHING;

INSERT INTO platform_risk_settings (id, max_daily_win_nanoton, max_round_exposure_nanoton, whale_bet_threshold_nanoton, auto_review_withdraw_nanoton, hot_wallet_max_balance_nanoton, hot_wallet_sweep_threshold_nanoton)
VALUES (1, 100000000000, 500000000000, 10000000000, 50000000000, 2000000000000, 1500000000000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO telegram_bot_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
