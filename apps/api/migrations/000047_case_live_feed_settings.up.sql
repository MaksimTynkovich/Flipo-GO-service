CREATE TABLE IF NOT EXISTS case_live_feed_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT false,
    intensity NUMERIC(6,3) NOT NULL DEFAULT 1,
    fill_when_sparse BOOLEAN NOT NULL DEFAULT true,
    min_visible INT NOT NULL DEFAULT 6,
    common_weight NUMERIC(8,3) NOT NULL DEFAULT 50,
    uncommon_weight NUMERIC(8,3) NOT NULL DEFAULT 25,
    rare_weight NUMERIC(8,3) NOT NULL DEFAULT 15,
    epic_weight NUMERIC(8,3) NOT NULL DEFAULT 7,
    legendary_weight NUMERIC(8,3) NOT NULL DEFAULT 3,
    fat_chance NUMERIC(6,4) NOT NULL DEFAULT 0.08,
    fat_min_floor_nanoton BIGINT NOT NULL DEFAULT 5000000000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO case_live_feed_settings (
    id, enabled, intensity, fill_when_sparse, min_visible,
    common_weight, uncommon_weight, rare_weight, epic_weight, legendary_weight,
    fat_chance, fat_min_floor_nanoton
) VALUES (
    1, false, 1, true, 6,
    50, 25, 15, 7, 3,
    0.08, 5000000000
)
ON CONFLICT (id) DO NOTHING;
