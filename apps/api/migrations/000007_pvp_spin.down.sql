DROP INDEX IF EXISTS idx_pvp_rooms_spin_at;

ALTER TABLE pvp_rooms
    DROP COLUMN IF EXISTS spin_at,
    DROP COLUMN IF EXISTS spin_ends_at,
    DROP COLUMN IF EXISTS payout_nanoton;
