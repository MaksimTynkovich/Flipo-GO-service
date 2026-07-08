CREATE TABLE IF NOT EXISTS promo_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    promo_code VARCHAR(32) NOT NULL REFERENCES promo_codes(code),
    bonus_nanoton BIGINT NOT NULL,
    wager_required_nanoton BIGINT NOT NULL,
    wager_progress_nanoton BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_redemptions_user_active
    ON promo_redemptions(user_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions(user_id);

CREATE TABLE IF NOT EXISTS telegram_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    total_users INT NOT NULL DEFAULT 0,
    sent_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS treasury_sweeps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount_nanoton BIGINT NOT NULL,
    cold_wallet_address VARCHAR(128) NOT NULL,
    hot_balance_before BIGINT NOT NULL DEFAULT 0,
    tx_hash VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treasury_sweeps_created ON treasury_sweeps(created_at DESC);
