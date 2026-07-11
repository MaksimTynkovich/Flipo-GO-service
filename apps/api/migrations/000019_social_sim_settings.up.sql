CREATE TABLE IF NOT EXISTS social_sim_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT false,
    crash_enabled BOOLEAN NOT NULL DEFAULT true,
    roulette_enabled BOOLEAN NOT NULL DEFAULT true,
    pvp_enabled BOOLEAN NOT NULL DEFAULT true,
    lobby_enabled BOOLEAN NOT NULL DEFAULT true,
    online_base_min INTEGER NOT NULL DEFAULT 18,
    online_base_max INTEGER NOT NULL DEFAULT 42,
    online_jitter DOUBLE PRECISION NOT NULL DEFAULT 0.12,
    tod_multipliers JSONB NOT NULL DEFAULT '[0.45,0.4,0.35,0.35,0.4,0.5,0.65,0.8,0.9,0.95,1.0,1.0,1.05,1.05,1.0,1.0,1.1,1.25,1.4,1.45,1.35,1.15,0.85,0.6]'::jsonb,
    bet_intensity DOUBLE PRECISION NOT NULL DEFAULT 8,
    bet_burst_chance DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    idle_gap_ms_min INTEGER NOT NULL DEFAULT 400,
    idle_gap_ms_max INTEGER NOT NULL DEFAULT 2200,
    stake_p50 DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    stake_p90 DOUBLE PRECISION NOT NULL DEFAULT 0.55,
    crash_auto_cashout_share DOUBLE PRECISION NOT NULL DEFAULT 0.55,
    crash_cashout_min DOUBLE PRECISION NOT NULL DEFAULT 1.2,
    crash_cashout_max DOUBLE PRECISION NOT NULL DEFAULT 4.5,
    roulette_red_weight DOUBLE PRECISION NOT NULL DEFAULT 0.46,
    roulette_black_weight DOUBLE PRECISION NOT NULL DEFAULT 0.46,
    roulette_green_weight DOUBLE PRECISION NOT NULL DEFAULT 0.08,
    pvp_max_ghost_rooms INTEGER NOT NULL DEFAULT 4,
    pvp_room_ttl_sec_min INTEGER NOT NULL DEFAULT 25,
    pvp_room_ttl_sec_max INTEGER NOT NULL DEFAULT 90,
    pvp_stake_min_frac DOUBLE PRECISION NOT NULL DEFAULT 0.12,
    pvp_stake_max_frac DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    chaos DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO social_sim_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
