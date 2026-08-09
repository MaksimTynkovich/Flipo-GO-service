-- Recreate empty social_sim_settings shell (historical shape from 000019; columns may differ).
CREATE TABLE IF NOT EXISTS social_sim_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  online_base_min INT NOT NULL DEFAULT 0,
  online_base_max INT NOT NULL DEFAULT 0,
  lobby_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  crash_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  roulette_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  bet_spread DOUBLE PRECISION NOT NULL DEFAULT 0.35,
  tod_multipliers JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
