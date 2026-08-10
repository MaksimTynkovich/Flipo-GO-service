-- Speed up admin quest analytics aggregations by day_msk / claimed_at.
CREATE INDEX IF NOT EXISTS idx_daily_quest_claims_day_msk
    ON daily_quest_claims(day_msk);

CREATE INDEX IF NOT EXISTS idx_daily_quest_claims_claimed_at
    ON daily_quest_claims(claimed_at);

CREATE INDEX IF NOT EXISTS idx_user_case_entitlements_source_created
    ON user_case_entitlements(source, created_at);

CREATE INDEX IF NOT EXISTS idx_case_opens_source_created
    ON case_opens(source, created_at);
