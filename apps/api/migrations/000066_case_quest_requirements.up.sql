ALTER TABLE cases
    ADD COLUMN IF NOT EXISTS required_name_tag VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS require_share BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS case_quest_shares (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    share_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, case_id)
);

CREATE INDEX IF NOT EXISTS idx_case_quest_shares_case_id ON case_quest_shares (case_id);
