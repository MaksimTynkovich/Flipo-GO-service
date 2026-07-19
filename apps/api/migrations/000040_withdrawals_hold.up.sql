ALTER TABLE users
    ADD COLUMN IF NOT EXISTS withdrawals_disabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS platform_withdrawal_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_withdrawal_settings (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;
