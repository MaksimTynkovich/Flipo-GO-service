CREATE TABLE IF NOT EXISTS admin_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind VARCHAR(64) NOT NULL,
    category VARCHAR(32) NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'info',
    title VARCHAR(128) NOT NULL,
    summary VARCHAR(512) NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    actor_telegram_id BIGINT NOT NULL DEFAULT 0,
    actor_username VARCHAR(64) NOT NULL DEFAULT '',
    actor_first_name VARCHAR(128) NOT NULL DEFAULT '',
    actor_last_name VARCHAR(128) NOT NULL DEFAULT '',
    amount_nanoton BIGINT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON admin_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_category_created ON admin_notifications (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON admin_notifications (created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_notifications_kind ON admin_notifications (kind);
