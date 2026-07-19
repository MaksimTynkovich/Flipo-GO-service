ALTER TABLE user_wheel_state
    ADD COLUMN IF NOT EXISTS referral_bonus_grants_today INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS referral_bonus_grants_date DATE;

ALTER TABLE user_wheel_state
    DROP CONSTRAINT IF EXISTS user_wheel_state_referral_bonus_grants_today_check;

ALTER TABLE user_wheel_state
    ADD CONSTRAINT user_wheel_state_referral_bonus_grants_today_check
    CHECK (referral_bonus_grants_today >= 0);
