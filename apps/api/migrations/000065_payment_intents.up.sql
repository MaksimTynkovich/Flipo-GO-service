CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    provider VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    amount_nanoton BIGINT NOT NULL,
    provider_amount VARCHAR(64) NOT NULL,
    provider_currency VARCHAR(16) NOT NULL,
    provider_invoice_id VARCHAR(128),
    pay_url VARCHAR(512),
    payload VARCHAR(128) NOT NULL,
    ton_usd_rate VARCHAR(32),
    stars_usd_rate VARCHAR(32),
    error_message TEXT,
    expires_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_payload ON payment_intents (payload);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_provider_invoice
    ON payment_intents (provider_invoice_id) WHERE provider_invoice_id IS NOT NULL AND provider_invoice_id <> '';
CREATE INDEX IF NOT EXISTS idx_payment_intents_user_created ON payment_intents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents (status);
