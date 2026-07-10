ALTER TABLE pvp_room_players
    ADD COLUMN IF NOT EXISTS stake_nanoton BIGINT;

UPDATE pvp_room_players p
SET stake_nanoton = r.bet_amount_nanoton
FROM pvp_rooms r
WHERE p.room_id = r.id
  AND (p.stake_nanoton IS NULL OR p.stake_nanoton = 0);

UPDATE pvp_room_players SET stake_nanoton = 0 WHERE stake_nanoton IS NULL;

ALTER TABLE pvp_room_players
    ALTER COLUMN stake_nanoton SET DEFAULT 0;

ALTER TABLE pvp_room_players
    ALTER COLUMN stake_nanoton SET NOT NULL;
