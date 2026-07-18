CREATE TABLE IF NOT EXISTS wheel_spin_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    segment_id UUID NOT NULL REFERENCES wheel_segments(id),
    created_by UUID NOT NULL REFERENCES users(id),
    note VARCHAR(256) NOT NULL DEFAULT '',
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wheel_spin_overrides_pending_user
    ON wheel_spin_overrides (user_id)
    WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wheel_spin_overrides_pending
    ON wheel_spin_overrides (created_at DESC)
    WHERE consumed_at IS NULL;
