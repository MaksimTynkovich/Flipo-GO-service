ALTER TABLE daily_quests
  DROP COLUMN IF EXISTS objective_param;

ALTER TABLE daily_quests
  ALTER COLUMN objective_type TYPE VARCHAR(32);
