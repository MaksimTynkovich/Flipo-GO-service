ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_ip VARCHAR(64),
    ADD COLUMN IF NOT EXISTS last_ip_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_last_ip ON users(last_ip) WHERE last_ip IS NOT NULL AND last_ip <> '';
