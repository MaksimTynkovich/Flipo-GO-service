CREATE TABLE IF NOT EXISTS platform_deposit_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    stars_usd_rate DECIMAL(12,6) NOT NULL DEFAULT 0.013,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_deposit_settings (id, stars_usd_rate)
VALUES (1, 0.013)
ON CONFLICT (id) DO NOTHING;
