package domain

import (
	"encoding/json"
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
	TonStatusPendingReview   TonTransferStatus = "pending_review"
	TonStatusApproved        TonTransferStatus = "approved"
	TonStatusQueued          TonTransferStatus = "queued"
	TonStatusBroadcasting    TonTransferStatus = "broadcasting"
	TonStatusCompleted       TonTransferStatus = "completed"
	TonStatusFailed          TonTransferStatus = "failed"
	TonStatusRejected        TonTransferStatus = "rejected"
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
	RiskScore      int                  `gorm:"not null;default:0" json:"risk_score"`
	RiskFlags      []string             `gorm:"type:jsonb;serializer:json" json:"risk_flags,omitempty"`
	ReviewReason   *string              `gorm:"type:text" json:"review_reason,omitempty"`
	ReviewedBy     *uuid.UUID           `gorm:"type:uuid" json:"reviewed_by,omitempty"`
	ReviewedAt     *time.Time           `json:"reviewed_at,omitempty"`
	ExpiresAt      *time.Time           `json:"expires_at,omitempty"`
	ConfirmedAt    *time.Time           `json:"confirmed_at,omitempty"`
	CreatedAt      time.Time            `json:"created_at"`
	UpdatedAt      time.Time            `json:"updated_at"`
}

func (t *TonTransfer) RiskFlagList() []string {
	if len(t.RiskFlags) == 0 {
		return nil
	}
	return t.RiskFlags
}

func (t *TonTransfer) SetRiskFlags(flags []string) {
	t.RiskFlags = flags
}

func ParseRiskFlags(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var flags []string
	if err := json.Unmarshal(raw, &flags); err != nil {
		return nil
	}
	return flags
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
	case TonStatusCompleted, TonStatusFailed, TonStatusExpired, TonStatusRejected:
		return true
	default:
		return false
	}
}

func (t *TonTransfer) IsPendingWithdrawal() bool {
	switch t.Status {
	case TonStatusPendingReview, TonStatusApproved, TonStatusQueued, TonStatusBroadcasting:
		return true
	default:
		return false
	}
}
