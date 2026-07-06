CREATE TABLE ton_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    direction VARCHAR(16) NOT NULL CHECK (direction IN ('deposit', 'withdraw')),
    status VARCHAR(32) NOT NULL,
    amount_nanoton BIGINT NOT NULL CHECK (amount_nanoton > 0),
    fee_nanoton BIGINT NOT NULL DEFAULT 0 CHECK (fee_nanoton >= 0),
    wallet_address VARCHAR(128) NOT NULL,
    deposit_comment VARCHAR(64),
    tx_hash VARCHAR(128),
    tx_lt BIGINT,
    idempotency_key VARCHAR(128),
    error_message TEXT,
    expires_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ton_transfers_idempotency_key
    ON ton_transfers(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX idx_ton_transfers_tx_hash
    ON ton_transfers(tx_hash)
    WHERE tx_hash IS NOT NULL;

CREATE UNIQUE INDEX idx_ton_transfers_deposit_comment
    ON ton_transfers(deposit_comment)
    WHERE deposit_comment IS NOT NULL;

CREATE INDEX idx_ton_transfers_user_id ON ton_transfers(user_id);
CREATE INDEX idx_ton_transfers_status ON ton_transfers(status);
CREATE INDEX idx_ton_transfers_user_status ON ton_transfers(user_id, status);
