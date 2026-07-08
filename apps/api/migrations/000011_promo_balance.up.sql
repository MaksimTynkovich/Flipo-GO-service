ALTER TABLE users
    ADD COLUMN IF NOT EXISTS promo_balance BIGINT NOT NULL DEFAULT 0;

UPDATE users u
SET promo_balance = pr.bonus_nanoton
FROM promo_redemptions pr
WHERE pr.user_id = u.id
  AND pr.status = 'active';
