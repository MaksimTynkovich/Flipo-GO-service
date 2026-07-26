-- Soft-delete cases so opens/loot FKs stay valid; free slug for reuse.

ALTER TABLE cases
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cases_deleted_at ON cases (deleted_at);

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_slug_key;
DROP INDEX IF EXISTS idx_cases_slug;
DROP INDEX IF EXISTS uni_cases_slug;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_slug_active
    ON cases (slug)
    WHERE deleted_at IS NULL;
