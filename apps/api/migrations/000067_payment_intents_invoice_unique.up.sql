-- GORM AutoMigrate previously created a full unique index on provider_invoice_id.
-- Stars intents leave it empty until payment succeeds, so a second create collided on ''.
-- Uniqueness for non-empty invoice IDs is already covered by idx_payment_intents_provider_invoice
-- (partial unique from 000065).

DROP INDEX IF EXISTS idx_payment_intents_provider_invoice_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_provider_invoice
    ON payment_intents (provider_invoice_id)
    WHERE provider_invoice_id IS NOT NULL AND provider_invoice_id <> '';
