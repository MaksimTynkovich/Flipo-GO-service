package postgres

import (
	"fmt"

	"gorm.io/gorm"
)

// migratePaymentIntentInvoiceUnique drops the full unique index GORM created on
// provider_invoice_id (collides on empty Stars invoices) and keeps the partial unique.
func migratePaymentIntentInvoiceUnique(db *gorm.DB) error {
	if !tableExists(db, "payment_intents") {
		return nil
	}
	statements := []string{
		`DROP INDEX IF EXISTS idx_payment_intents_provider_invoice_id`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_provider_invoice
			ON payment_intents (provider_invoice_id)
			WHERE provider_invoice_id IS NOT NULL AND provider_invoice_id <> ''`,
	}
	for _, stmt := range statements {
		if err := db.Exec(stmt).Error; err != nil {
			return fmt.Errorf("migrate payment intent invoice unique: %w", err)
		}
	}
	return nil
}
