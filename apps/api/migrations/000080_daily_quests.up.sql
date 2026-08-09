CREATE TABLE IF NOT EXISTS daily_quests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(256) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    active_from DATE,
    active_to DATE,
    objective_type VARCHAR(32) NOT NULL,
    objective_target INT NOT NULL,
    objective_case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    reward_type VARCHAR(32) NOT NULL,
    reward_nanoton BIGINT NOT NULL DEFAULT 0,
    reward_case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_quests_active_sort
    ON daily_quests(active, sort_order);

CREATE TABLE IF NOT EXISTS daily_quest_board_settings (
    id INT PRIMARY KEY CHECK (id = 1),
    bonus_title VARCHAR(256) NOT NULL DEFAULT 'Бонус дня',
    bonus_description TEXT NOT NULL DEFAULT '',
    bonus_reward_type VARCHAR(32) NOT NULL DEFAULT 'balance_nanoton',
    bonus_reward_nanoton BIGINT NOT NULL DEFAULT 0,
    bonus_reward_case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    bonus_active BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO daily_quest_board_settings (id, bonus_title, bonus_description, bonus_active)
VALUES (1, 'Бонус дня', 'Выполни все задания', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS daily_quest_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    day_msk DATE NOT NULL,
    claim_kind VARCHAR(16) NOT NULL,
    quest_id UUID REFERENCES daily_quests(id) ON DELETE CASCADE,
    reward_type VARCHAR(32) NOT NULL,
    reward_nanoton BIGINT NOT NULL DEFAULT 0,
    reward_case_id UUID,
    entitlement_id UUID,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT daily_quest_claims_kind_check CHECK (claim_kind IN ('task', 'bonus')),
    CONSTRAINT daily_quest_claims_task_quest CHECK (
        (claim_kind = 'task' AND quest_id IS NOT NULL) OR
        (claim_kind = 'bonus' AND quest_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_quest_claims_task
    ON daily_quest_claims(user_id, day_msk, quest_id)
    WHERE claim_kind = 'task';

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_quest_claims_bonus
    ON daily_quest_claims(user_id, day_msk)
    WHERE claim_kind = 'bonus';

CREATE INDEX IF NOT EXISTS idx_daily_quest_claims_user_day
    ON daily_quest_claims(user_id, day_msk);

CREATE TABLE IF NOT EXISTS user_case_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    case_id UUID NOT NULL REFERENCES cases(id),
    source VARCHAR(32) NOT NULL,
    source_ref UUID NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'available',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ,
    CONSTRAINT user_case_entitlements_status_check CHECK (status IN ('available', 'used')),
    CONSTRAINT uq_user_case_entitlements_source_ref UNIQUE (source, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_user_case_entitlements_available
    ON user_case_entitlements(user_id, case_id, status)
    WHERE status = 'available';
