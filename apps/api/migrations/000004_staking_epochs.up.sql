CREATE TABLE staking_epochs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staking_epochs_status ON staking_epochs(status);
CREATE INDEX idx_staking_epochs_ends_at ON staking_epochs(ends_at);

ALTER TABLE staking_positions
    ADD COLUMN IF NOT EXISTS epoch_id UUID REFERENCES staking_epochs(id),
    ADD COLUMN IF NOT EXISTS gift_slug VARCHAR(128) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'inventory',
    ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(32);

ALTER TABLE staking_positions DROP CONSTRAINT IF EXISTS staking_positions_inventory_item_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staking_positions_item_active
    ON staking_positions(inventory_item_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_staking_positions_epoch_active
    ON staking_positions(epoch_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_staking_positions_gift_slug_active
    ON staking_positions(gift_slug) WHERE is_active = TRUE;

CREATE TABLE staking_gift_claims (
    gift_slug VARCHAR(128) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    position_id UUID NOT NULL REFERENCES staking_positions(id) ON DELETE CASCADE,
    epoch_id UUID NOT NULL REFERENCES staking_epochs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staking_gift_claims_user ON staking_gift_claims(user_id);
