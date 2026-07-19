CREATE TABLE IF NOT EXISTS platform_maintenance_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT false,
    message TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_maintenance_settings (id, enabled, message)
VALUES (1, false, '')
ON CONFLICT (id) DO NOTHING;
