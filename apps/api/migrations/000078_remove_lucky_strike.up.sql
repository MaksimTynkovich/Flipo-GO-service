-- Remove Lucky Strike (daily wheel) from active game modes.
-- Historical wheel_* tables and ledger rows are left intact.
DELETE FROM game_configs WHERE game_type = 'wheel';
