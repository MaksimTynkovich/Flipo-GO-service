DROP INDEX IF EXISTS idx_payment_intents_provider_invoice;

-- Restore the previous (incorrect) GORM-style unique only if rolling back intentionally.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_provider_invoice_id
    ON payment_intents (provider_invoice_id);
