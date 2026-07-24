-- Complete any in-progress promo playthroughs and unlock locked promo funds.
UPDATE promo_redemptions
SET status = 'completed',
    completed_at = COALESCE(completed_at, NOW())
WHERE status = 'active';

UPDATE users SET promo_balance = 0 WHERE promo_balance <> 0;

DROP INDEX IF EXISTS idx_promo_redemptions_user_active;

ALTER TABLE promo_codes DROP COLUMN IF EXISTS wager_multiplier;

ALTER TABLE promo_redemptions
    DROP COLUMN IF EXISTS wager_required_nanoton,
    DROP COLUMN IF EXISTS wager_progress_nanoton,
    DROP COLUMN IF EXISTS max_cashout_nanoton;

ALTER TABLE users DROP COLUMN IF EXISTS promo_balance;
