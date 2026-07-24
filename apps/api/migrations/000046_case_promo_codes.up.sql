CREATE TABLE IF NOT EXISTS case_promo_codes (
    code VARCHAR(32) PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    max_uses INT NOT NULL DEFAULT 0,
    used_count INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_promo_codes_case_id ON case_promo_codes (case_id);

CREATE TABLE IF NOT EXISTS case_promo_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    code VARCHAR(32) NOT NULL,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    case_open_id UUID NOT NULL REFERENCES case_opens(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT idx_case_promo_user_code UNIQUE (user_id, code)
);

CREATE INDEX IF NOT EXISTS idx_case_promo_redemptions_code ON case_promo_redemptions (code);
CREATE INDEX IF NOT EXISTS idx_case_promo_redemptions_case_id ON case_promo_redemptions (case_id);
