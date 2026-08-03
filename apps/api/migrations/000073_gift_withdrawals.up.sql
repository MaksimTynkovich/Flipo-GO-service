CREATE TABLE IF NOT EXISTS gift_withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL UNIQUE REFERENCES inventory_items(id),
    user_id UUID NOT NULL REFERENCES users(id),
    cost_nanoton BIGINT NOT NULL DEFAULT 0,
    floor_nanoton BIGINT NOT NULL DEFAULT 0,
    collection_slug VARCHAR(128) NOT NULL DEFAULT '',
    name VARCHAR(256) NOT NULL DEFAULT '',
    source VARCHAR(32) NOT NULL DEFAULT 'user',
    withdrawn_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gift_withdrawals_withdrawn_at ON gift_withdrawals (withdrawn_at);
CREATE INDEX IF NOT EXISTS idx_gift_withdrawals_user_id ON gift_withdrawals (user_id);

-- Backfill completed gift withdrawals (best-effort from inventory status).
INSERT INTO gift_withdrawals (
    id, inventory_item_id, user_id, cost_nanoton, floor_nanoton,
    collection_slug, name, source, withdrawn_at, created_at
)
SELECT
    gen_random_uuid(),
    i.id,
    i.user_id,
    GREATEST(
        COALESCE(NULLIF((i.metadata->>'case_cashout_nanoton')::bigint, 0), 0),
        COALESCE(i.floor_price_nanoton, 0)
    ),
    COALESCE(i.floor_price_nanoton, 0),
    COALESCE(i.collection_slug, ''),
    COALESCE(i.name, ''),
    'backfill',
    COALESCE(i.updated_at, i.created_at, NOW()),
    NOW()
FROM inventory_items i
WHERE i.status = 'withdrawn'
  AND i.source = 'telegram_gift'
  AND NOT EXISTS (
      SELECT 1 FROM gift_withdrawals g WHERE g.inventory_item_id = i.id
  );
