CREATE TABLE IF NOT EXISTS telegram_broadcast_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES telegram_broadcasts(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_broadcast
    ON telegram_broadcast_deliveries (broadcast_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_broadcast_status
    ON telegram_broadcast_deliveries (broadcast_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_deliveries_unique
    ON telegram_broadcast_deliveries (broadcast_id, telegram_id);
