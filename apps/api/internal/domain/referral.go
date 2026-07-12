package domain

import (
	"time"

	"github.com/google/uuid"
)

const (
	DefaultReferralGGRSharePercent       = 5.0
	DefaultReferralMilestoneNanoton      = 50_000_000 // 0.05 TON
	DefaultReferralMilestoneMonthlyCap   = 20
	DefaultReferralPerkBoostPercent      = 0.5
	DefaultReferralPerkLimitBonusNano    = 20_000_000_000 // 20 TON
	DefaultReferralPerkDuration          = 30 * 24 * time.Hour
	DefaultReferralQualifyMinDepositNano = 500_000_000    // 0.5 TON
	DefaultReferralQualifyMinStakeNano    = 1_000_000_000  // 1 TON
	DefaultReferralQualifyMinAge         = 7 * 24 * time.Hour
	DefaultReferralMilestoneMinBetNano   = 100_000_000    // 0.1 TON
	RefWelcomePromoCode                  = "REF_WELCOME"
	RefWelcomeMaxCashoutNano             = 30_000_000 // 0.03 TON
)

// ReferralPerk — invitee staking perks activated after first stake.
type ReferralPerk struct {
	UserID                  uuid.UUID `gorm:"type:uuid;primaryKey" json:"user_id"`
	StakingBoostPercent     float64   `gorm:"type:decimal(6,2);not null;default:0.5" json:"staking_boost_percent"`
	StakeLimitBonusNanoton  int64     `gorm:"not null;default:20000000000" json:"stake_limit_bonus_nanoton"`
	ActivatedAt             time.Time `json:"activated_at"`
	ExpiresAt               time.Time `json:"expires_at"`
}

func (ReferralPerk) TableName() string { return "referral_perks" }

func (p *ReferralPerk) Active(now time.Time) bool {
	if p == nil {
		return false
	}
	return !now.Before(p.ActivatedAt) && now.Before(p.ExpiresAt)
}

// ReferralMilestone — one-time referrer payout when referral makes a qualifying bet.
type ReferralMilestone struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	ReferrerID    uuid.UUID `gorm:"type:uuid;not null;index" json:"referrer_id"`
	ReferralID    uuid.UUID `gorm:"type:uuid;not null;index" json:"referral_id"`
	AmountNanoton int64     `gorm:"not null" json:"amount_nanoton"`
	CreatedAt     time.Time `json:"created_at"`
}

func (ReferralMilestone) TableName() string { return "referral_milestones" }
