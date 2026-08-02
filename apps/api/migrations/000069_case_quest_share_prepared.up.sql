CREATE TABLE IF NOT EXISTS case_quest_share_prepared (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id),
    case_id UUID NOT NULL REFERENCES cases(id),
    prepared_message_id TEXT NOT NULL DEFAULT '',
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_quest_share_prepared_user_case
    ON case_quest_share_prepared (user_id, case_id);
CREATE INDEX IF NOT EXISTS idx_case_quest_share_prepared_created_at
    ON case_quest_share_prepared (created_at);
