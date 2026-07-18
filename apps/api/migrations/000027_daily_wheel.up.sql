CREATE TABLE IF NOT EXISTS wheel_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label VARCHAR(64) NOT NULL,
    amount_nanoton BIGINT NOT NULL,
    weight INT NOT NULL CHECK (weight > 0),
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_wheel_state (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bonus_spins INT NOT NULL DEFAULT 0 CHECK (bonus_spins >= 0),
    last_daily_spin_date DATE,
    streak_days INT NOT NULL DEFAULT 0,
    streak_updated_on DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wheel_spins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    segment_id UUID NOT NULL REFERENCES wheel_segments(id),
    prize_nanoton BIGINT NOT NULL,
    spin_source VARCHAR(16) NOT NULL,
    rng_roll INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wheel_spins_user_created ON wheel_spins(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wheel_spins_created ON wheel_spins(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wheel_spins_source ON wheel_spins(spin_source);

INSERT INTO wheel_segments (id, label, amount_nanoton, weight, sort_order, active)
VALUES
    ('a1000000-0000-4000-8000-000000000001', 'Почти пусто', 10000000, 350, 1, TRUE),
    ('a1000000-0000-4000-8000-000000000002', 'Мелкий', 20000000, 250, 2, TRUE),
    ('a1000000-0000-4000-8000-000000000003', 'Малый', 50000000, 200, 3, TRUE),
    ('a1000000-0000-4000-8000-000000000004', 'Средний', 100000000, 120, 4, TRUE),
    ('a1000000-0000-4000-8000-000000000005', 'Хороший', 250000000, 50, 5, TRUE),
    ('a1000000-0000-4000-8000-000000000006', 'Крупный', 500000000, 25, 6, TRUE),
    ('a1000000-0000-4000-8000-000000000007', 'Джекпот', 1000000000, 4, 7, TRUE),
    ('a1000000-0000-4000-8000-000000000008', 'Мега', 2000000000, 1, 8, TRUE)
ON CONFLICT (id) DO NOTHING;
