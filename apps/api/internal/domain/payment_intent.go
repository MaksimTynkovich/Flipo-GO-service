package domain

import (
	"time"

	"github.com/google/uuid"
)

// Alt deposit providers (not on-chain TON wallet).
const (
	PaymentProviderCryptoBot = "cryptobot"
	PaymentProviderStars     = "stars"
)

const (
	PaymentStatusAwaiting = "awaiting_payment"
	PaymentStatusPaid     = "paid"
	PaymentStatusExpired  = "expired"
	PaymentStatusFailed   = "failed"
)

// PaymentIntent — Crypto Bot / Telegram Stars deposit awaiting confirmation.
type PaymentIntent struct {
	ID                 uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID             uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	Provider           string     `gorm:"size:32;not null;index" json:"provider"`
	Status             string     `gorm:"size:32;not null;index" json:"status"`
	AmountNanoton      int64      `gorm:"not null" json:"amount_nanoton"`
	ProviderAmount     string     `gorm:"size:64;not null" json:"provider_amount"`
	ProviderCurrency   string     `gorm:"size:16;not null" json:"provider_currency"`
	ProviderInvoiceID  string     `gorm:"size:128" json:"provider_invoice_id,omitempty"`
	PayURL             string     `gorm:"size:512" json:"pay_url,omitempty"`
	Payload            string     `gorm:"size:128;uniqueIndex" json:"payload"`
	TonUSDRate         string     `gorm:"size:32" json:"ton_usd_rate,omitempty"`
	StarsUSDRate       string     `gorm:"size:32" json:"stars_usd_rate,omitempty"`
	ErrorMessage       *string    `gorm:"type:text" json:"error_message,omitempty"`
	ExpiresAt          *time.Time `json:"expires_at,omitempty"`
	PaidAt             *time.Time `json:"paid_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

func (PaymentIntent) TableName() string { return "payment_intents" }
