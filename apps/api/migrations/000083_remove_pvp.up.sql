-- Remove PvP (Комнаты) from active game modes.
-- Historical pvp_* tables and ledger rows are left intact.
DELETE FROM game_configs WHERE game_type = 'pvp';
