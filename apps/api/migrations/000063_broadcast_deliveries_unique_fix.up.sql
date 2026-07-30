-- Ensure unique key used by ON CONFLICT (broadcast_id, telegram_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_deliveries_unique
    ON telegram_broadcast_deliveries (broadcast_id, telegram_id);

CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_broadcast
    ON telegram_broadcast_deliveries (broadcast_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_broadcast_status
    ON telegram_broadcast_deliveries (broadcast_id, status);
