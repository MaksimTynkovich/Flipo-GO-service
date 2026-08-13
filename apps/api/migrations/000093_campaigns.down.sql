DROP INDEX IF EXISTS idx_users_campaign_id;

ALTER TABLE users
    DROP COLUMN IF EXISTS campaign_id,
    DROP COLUMN IF EXISTS acquisition_payload;

DROP TABLE IF EXISTS campaigns;
