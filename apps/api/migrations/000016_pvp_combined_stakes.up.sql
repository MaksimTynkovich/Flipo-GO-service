ALTER TABLE pvp_room_players
    ADD COLUMN IF NOT EXISTS balance_nanoton BIGINT NOT NULL DEFAULT 0;

UPDATE pvp_room_players
SET balance_nanoton = stake_nanoton
WHERE funding_type = 'balance'
  AND balance_nanoton = 0
  AND stake_nanoton > 0;

CREATE TABLE IF NOT EXISTS pvp_room_player_gifts (
    room_id UUID NOT NULL REFERENCES pvp_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    value_nanoton BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (room_id, user_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_pvp_room_player_gifts_room
    ON pvp_room_player_gifts(room_id);

INSERT INTO pvp_room_player_gifts (room_id, user_id, inventory_item_id, value_nanoton)
SELECT
    p.room_id,
    p.user_id,
    p.inventory_item_id,
    CASE
        WHEN p.funding_type IN ('gift', 'combined') THEN GREATEST(p.stake_nanoton - COALESCE(p.balance_nanoton, 0), 0)
        ELSE 0
    END
FROM pvp_room_players p
WHERE p.inventory_item_id IS NOT NULL
ON CONFLICT DO NOTHING;
