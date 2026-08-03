CREATE TABLE IF NOT EXISTS user_case_cooldowns (
    user_id UUID NOT NULL,
    case_id UUID NOT NULL,
    last_claimed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, case_id)
);

CREATE INDEX IF NOT EXISTS idx_user_case_cooldowns_claimed
    ON user_case_cooldowns (last_claimed_at);
