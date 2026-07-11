DROP TABLE IF EXISTS pvp_room_player_gifts;

ALTER TABLE pvp_room_players
    DROP COLUMN IF EXISTS balance_nanoton;
