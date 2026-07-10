ALTER TABLE pvp_room_players
    DROP COLUMN IF EXISTS inventory_item_id,
    DROP COLUMN IF EXISTS funding_type;

DROP INDEX IF EXISTS idx_game_bets_inventory_item_id;

ALTER TABLE game_bets
    DROP COLUMN IF EXISTS inventory_item_id,
    DROP COLUMN IF EXISTS funding_type;
