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

// PickLocalized returns EN or RU copy for the player's locale.
// Empty values fall back to the other language, then to fallback (legacy single field).
func PickLocalized(locale, en, ru, fallback string) string {
	locale = NormalizeLocale(locale)
	en = strings.TrimSpace(en)
	ru = strings.TrimSpace(ru)
	fallback = strings.TrimSpace(fallback)
	if locale == LocaleRU {
		if ru != "" {
			return ru
		}
		if en != "" {
			return en
		}
		return fallback
	}
	if en != "" {
		return en
	}
	if ru != "" {
		return ru
	}
	return fallback
}

// SyncLocalized fills missing EN/RU from each other or from the legacy fallback
// and returns the English-first canonical string for slug/stats columns.
func SyncLocalized(en, ru, fallback string) (enOut, ruOut, canonical string) {
	enOut = strings.TrimSpace(en)
	ruOut = strings.TrimSpace(ru)
	fallback = strings.TrimSpace(fallback)
	if enOut == "" {
		enOut = ruOut
	}
	if ruOut == "" {
		ruOut = enOut
	}
	if enOut == "" && ruOut == "" {
		enOut, ruOut = fallback, fallback
	}
	canonical = PickLocalized(DefaultLocale, enOut, ruOut, fallback)
	return enOut, ruOut, canonical
}

// ClipRunes trims space and caps the string to n Unicode characters.
func ClipRunes(s string, n int) string {
	s = strings.TrimSpace(s)
	if n <= 0 {
		return s
	}
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
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

func (u *User) LocalizedLocale() string {
	if u == nil {
		return DefaultLocale
	}
	return NormalizeLocale(u.Locale)
}

type TelegramRecipient struct {
	TelegramID int64  `gorm:"column:telegram_id"`
	Locale     string `gorm:"column:locale"`
}
