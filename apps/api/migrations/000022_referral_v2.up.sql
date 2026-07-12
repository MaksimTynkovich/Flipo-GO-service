ALTER TABLE platform_yield_settings
    ADD COLUMN IF NOT EXISTS referral_ggr_share_percent DECIMAL(6,2) NOT NULL DEFAULT 5;

ALTER TABLE platform_yield_settings
    ADD COLUMN IF NOT EXISTS referral_milestone_nanoton BIGINT NOT NULL DEFAULT 50000000;

ALTER TABLE platform_yield_settings
    ADD COLUMN IF NOT EXISTS referral_milestone_monthly_cap INT NOT NULL DEFAULT 20;

ALTER TABLE platform_yield_settings
    ADD COLUMN IF NOT EXISTS referral_monthly_payout_cap_nanoton BIGINT NOT NULL DEFAULT 0;

UPDATE platform_yield_settings
SET referral_share_percent = 5
WHERE referral_share_percent = 3;

CREATE TABLE IF NOT EXISTS referral_perks (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    staking_boost_percent DECIMAL(6,2) NOT NULL DEFAULT 0.5,
    stake_limit_bonus_nanoton BIGINT NOT NULL DEFAULT 20000000000,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referral_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_nanoton BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (referrer_id, referral_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_milestones_referrer_created
    ON referral_milestones(referrer_id, created_at);

ALTER TABLE promo_redemptions
    ADD COLUMN IF NOT EXISTS max_cashout_nanoton BIGINT NOT NULL DEFAULT 0;

INSERT INTO promo_codes (code, bonus_nanoton, wager_multiplier, max_uses, used_count, active)
VALUES ('REF_WELCOME', 50000000, 30, 0, 0, TRUE)
ON CONFLICT (code) DO NOTHING;
