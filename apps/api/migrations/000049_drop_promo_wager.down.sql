ALTER TABLE users
    ADD COLUMN IF NOT EXISTS promo_balance BIGINT NOT NULL DEFAULT 0;

ALTER TABLE promo_codes
    ADD COLUMN IF NOT EXISTS wager_multiplier DECIMAL(6,2) NOT NULL DEFAULT 1;

ALTER TABLE promo_redemptions
    ADD COLUMN IF NOT EXISTS wager_required_nanoton BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS wager_progress_nanoton BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_cashout_nanoton BIGINT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_redemptions_user_active
    ON promo_redemptions(user_id)
    WHERE status = 'active';
