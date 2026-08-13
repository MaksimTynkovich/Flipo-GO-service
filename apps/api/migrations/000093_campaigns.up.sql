CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(24) NOT NULL,
    name VARCHAR(128) NOT NULL,
    source VARCHAR(32) NOT NULL,
    content VARCHAR(64) NOT NULL DEFAULT '',
    landing VARCHAR(16) NOT NULL DEFAULT '',
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_campaigns_code ON campaigns (code);
CREATE INDEX idx_campaigns_status ON campaigns (status);
CREATE INDEX idx_campaigns_source ON campaigns (source);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id),
    ADD COLUMN IF NOT EXISTS acquisition_payload VARCHAR(64) NOT NULL DEFAULT '';

CREATE INDEX idx_users_campaign_id ON users (campaign_id);
