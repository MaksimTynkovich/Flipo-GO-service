ALTER TABLE daily_quests
  ALTER COLUMN objective_target TYPE INTEGER USING LEAST(objective_target, 2147483647)::integer;
