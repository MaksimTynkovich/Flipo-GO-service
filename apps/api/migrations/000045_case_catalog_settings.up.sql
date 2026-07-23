CREATE TABLE IF NOT EXISTS case_catalog_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    banners_enabled BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO case_catalog_settings (id, banners_enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;
