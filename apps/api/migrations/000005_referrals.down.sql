DROP INDEX IF EXISTS idx_users_referrer_id;

ALTER TABLE users
    DROP COLUMN IF EXISTS referrer_id;
