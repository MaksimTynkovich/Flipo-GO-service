-- Admin-controlled game outcome overrides (seed-search based, provably-fair).

CREATE TABLE IF NOT EXISTS game_outcome_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    game_type varchar(16) NOT NULL,
    target jsonb NOT NULL,
    rounds_remaining integer NOT NULL,
    created_by uuid,
    note varchar(256) NOT NULL DEFAULT '',
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcome_overrides_game ON game_outcome_overrides (game_type);

ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS admin_influenced boolean NOT NULL DEFAULT false;
