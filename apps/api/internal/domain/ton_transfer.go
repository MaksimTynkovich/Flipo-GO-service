package domain

import (
	"time"

	"github.com/google/uuid"
)

type TonTransferDirection string

const (
	TonDirectionDeposit  TonTransferDirection = "deposit"
	TonDirectionWithdraw TonTransferDirection = "withdraw"
)

type TonTransferStatus string

const (
	TonStatusAwaitingPayment TonTransferStatus = "awaiting_payment"
	TonStatusPaymentSeen     TonTransferStatus = "payment_seen"
	TonStatusQueued          TonTransferStatus = "queued"
	TonStatusBroadcasting    TonTransferStatus = "broadcasting"
	TonStatusCompleted       TonTransferStatus = "completed"
	TonStatusFailed          TonTransferStatus = "failed"
	TonStatusExpired         TonTransferStatus = "expired"
)

type TonTransfer struct {
	ID             uuid.UUID            `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID         uuid.UUID            `gorm:"type:uuid;not null;index" json:"user_id"`
	Direction      TonTransferDirection `gorm:"type:varchar(16);not null" json:"direction"`
	Status         TonTransferStatus    `gorm:"type:varchar(32);not null;index" json:"status"`
	AmountNanoton  int64                `gorm:"not null" json:"amount_nanoton"`
	FeeNanoton     int64                `gorm:"not null;default:0" json:"fee_nanoton"`
	WalletAddress  string               `gorm:"size:128;not null" json:"wallet_address"`
	DepositComment *string              `gorm:"size:64;uniqueIndex" json:"deposit_comment,omitempty"`
	TxHash         *string              `gorm:"size:128;uniqueIndex" json:"tx_hash,omitempty"`
	TxLT           *int64               `json:"tx_lt,omitempty"`
	IdempotencyKey *string              `gorm:"size:128;uniqueIndex" json:"idempotency_key,omitempty"`
	ErrorMessage   *string              `gorm:"type:text" json:"error_message,omitempty"`
	ExpiresAt      *time.Time           `json:"expires_at,omitempty"`
	ConfirmedAt    *time.Time           `json:"confirmed_at,omitempty"`
	CreatedAt      time.Time            `json:"created_at"`
	UpdatedAt      time.Time            `json:"updated_at"`
}

func (TonTransfer) TableName() string { return "ton_transfers" }

func (t *TonTransfer) NetAmountNanoton() int64 {
	if t.Direction == TonDirectionWithdraw {
		return t.AmountNanoton - t.FeeNanoton
	}
	return t.AmountNanoton
}

func (t *TonTransfer) IsTerminal() bool {
	switch t.Status {
	case TonStatusCompleted, TonStatusFailed, TonStatusExpired:
		return true
	default:
		return false
	}
}
