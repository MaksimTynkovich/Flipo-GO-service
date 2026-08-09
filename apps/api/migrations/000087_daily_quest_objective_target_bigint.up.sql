ALTER TABLE daily_quests
  ALTER COLUMN objective_target TYPE BIGINT USING objective_target::bigint;
