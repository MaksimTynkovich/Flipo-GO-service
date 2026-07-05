DROP TABLE IF EXISTS staking_gift_claims;

DROP INDEX IF EXISTS idx_staking_positions_gift_slug_active;
DROP INDEX IF EXISTS idx_staking_positions_epoch_active;
DROP INDEX IF EXISTS idx_staking_positions_item_active;

ALTER TABLE staking_positions
    DROP COLUMN IF EXISTS revoked_reason,
    DROP COLUMN IF EXISTS source,
    DROP COLUMN IF EXISTS gift_slug,
    DROP COLUMN IF EXISTS epoch_id;

DROP TABLE IF EXISTS staking_epochs;
