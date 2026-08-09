ALTER TABLE daily_quests
  ADD COLUMN IF NOT EXISTS objective_param BIGINT NOT NULL DEFAULT 0;

-- Allow slightly longer objective type keys (game challenge names).
ALTER TABLE daily_quests
  ALTER COLUMN objective_type TYPE VARCHAR(48);
