CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_redemptions_user_code
    ON promo_redemptions(user_id, promo_code);
