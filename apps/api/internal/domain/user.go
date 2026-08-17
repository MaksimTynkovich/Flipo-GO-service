package domain

import (
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type StakingTier string

const (
	TierBase  StakingTier = "base"
	TierBoost StakingTier = "boost"
)

const (
	LocaleEN      = "en"
	LocaleRU      = "ru"
	DefaultLocale = LocaleEN
)

func NormalizeLocale(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case LocaleRU, "ru-ru", "russian":
		return LocaleRU
	default:
		return LocaleEN
	}
}

type User struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TelegramID     int64     `gorm:"uniqueIndex;not null" json:"telegram_id"`
	Username       string    `gorm:"size:64" json:"username"`
	FirstName      string    `gorm:"size:128" json:"first_name"`
	LastName       string    `gorm:"size:128" json:"last_name"`
	PhotoURL       string    `gorm:"size:512" json:"photo_url"`
	Locale         string    `gorm:"size:8;not null;default:'en'" json:"locale"`
	TonWallet      string    `gorm:"size:66;index" json:"ton_wallet"`
	BettingBalance int64     `gorm:"not null;default:0" json:"betting_balance"`
	// AdminCreditNanoton — remaining balance that came from admin_adjust (not live deposits).
	// Spent first on debits so case bank / P&L can treat that spend as non-organic.
	AdminCreditNanoton  int64          `gorm:"not null;default:0" json:"admin_credit_nanoton"`
	ReferrerID          *uuid.UUID     `gorm:"type:uuid;index" json:"referrer_id,omitempty"`
	CampaignID          *uuid.UUID     `gorm:"type:uuid;index" json:"campaign_id,omitempty"`
	AcquisitionPayload  string         `gorm:"size:64" json:"acquisition_payload,omitempty"`
	StakingTier         StakingTier    `gorm:"type:varchar(16);not null;default:'base'" json:"staking_tier"`
	IsBanned            bool           `gorm:"not null;default:false" json:"is_banned"`
	WithdrawalsDisabled bool           `gorm:"not null;default:false" json:"withdrawals_disabled"`
	RiskFlags           []string       `gorm:"type:jsonb;serializer:json" json:"risk_flags,omitempty"`
	LastLoginAt         *time.Time     `json:"last_login_at,omitempty"`
	CreatedAt           time.Time      `json:"created_at"`
	UpdatedAt           time.Time      `json:"updated_at"`
	DeletedAt           gorm.DeletedAt `gorm:"index" json:"-"`

	Inventory        []InventoryItem   `gorm:"foreignKey:UserID" json:"-"`
	StakingPositions []StakingPosition `gorm:"foreignKey:UserID" json:"-"`
}
