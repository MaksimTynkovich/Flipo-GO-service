ALTER TABLE pvp_rooms
    ADD COLUMN IF NOT EXISTS spin_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS spin_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payout_nanoton BIGINT;

CREATE INDEX IF NOT EXISTS idx_pvp_rooms_spin_at ON pvp_rooms (spin_at) WHERE status IN ('countdown', 'spinning');
