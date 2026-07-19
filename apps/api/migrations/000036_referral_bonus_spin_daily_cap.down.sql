ALTER TABLE user_wheel_state
    DROP CONSTRAINT IF EXISTS user_wheel_state_referral_bonus_grants_today_check;

ALTER TABLE user_wheel_state
    DROP COLUMN IF EXISTS referral_bonus_grants_today,
    DROP COLUMN IF EXISTS referral_bonus_grants_date;
