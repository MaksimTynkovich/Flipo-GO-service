-- Companion SQL for cases feature (applied via GORM AutoMigrate + migrateCases seed).
-- Kept for documentation parity with numbered migrations.

CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(128) NOT NULL,
    subtitle VARCHAR(256) NOT NULL DEFAULT '',
    image_url VARCHAR(512) NOT NULL DEFAULT '',
    accent_color VARCHAR(32) NOT NULL DEFAULT '',
    price_nanoton BIGINT NOT NULL DEFAULT 0,
    kind VARCHAR(16) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    require_channel BOOLEAN NOT NULL DEFAULT FALSE,
    target_rtp_bps INT NOT NULL DEFAULT 9000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cases_kind ON cases(kind);
CREATE INDEX IF NOT EXISTS idx_cases_active ON cases(active);

CREATE TABLE IF NOT EXISTS case_loot_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    collection_slug VARCHAR(128) NOT NULL,
    weight INT NOT NULL CHECK (weight > 0),
    display_name VARCHAR(128) NOT NULL,
    image_url VARCHAR(512) NOT NULL DEFAULT '',
    rarity_label VARCHAR(64) NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    floor_price_nanoton BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_case_loot_entries_case_id ON case_loot_entries(case_id);

CREATE TABLE IF NOT EXISTS case_opens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES cases(id),
    price_paid_nanoton BIGINT NOT NULL,
    source VARCHAR(16) NOT NULL,
    rng_roll INT NOT NULL,
    loot_entry_id UUID NOT NULL REFERENCES case_loot_entries(id),
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_case_opens_user_created ON case_opens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_opens_case_id ON case_opens(case_id);

CREATE TABLE IF NOT EXISTS user_case_state (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_daily_open_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
