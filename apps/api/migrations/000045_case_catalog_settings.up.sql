CREATE TABLE IF NOT EXISTS case_catalog_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT true,
    banners_enabled BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO case_catalog_settings (id, enabled, banners_enabled)
VALUES (1, true, false)
ON CONFLICT (id) DO NOTHING;
