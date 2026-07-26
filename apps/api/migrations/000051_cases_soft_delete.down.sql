DROP INDEX IF EXISTS idx_cases_slug_active;
DROP INDEX IF EXISTS idx_cases_deleted_at;

ALTER TABLE cases DROP COLUMN IF EXISTS deleted_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_slug ON cases (slug);
