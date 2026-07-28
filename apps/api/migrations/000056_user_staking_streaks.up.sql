CREATE TABLE IF NOT EXISTS user_staking_streaks (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_streak INT NOT NULL DEFAULT 0,
    last_staked_msk_date DATE,
    bonus_payouts_remaining INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_staking_streaks_bonus
    ON user_staking_streaks (bonus_payouts_remaining)
    WHERE bonus_payouts_remaining > 0;
