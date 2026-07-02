package domain

import (
	"time"

	"github.com/google/uuid"
)

type StakingPosition struct {
	ID                  uuid.UUID   `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID              uuid.UUID   `gorm:"type:uuid;not null;index" json:"user_id"`
	InventoryItemID     uuid.UUID   `gorm:"type:uuid;not null;uniqueIndex" json:"inventory_item_id"`
	TierAtStake         StakingTier `gorm:"type:varchar(16);not null" json:"tier_at_stake"`
	PrincipalNanoton    int64       `gorm:"not null" json:"principal_nanoton"`
	AccruedYieldNanoton int64       `gorm:"not null;default:0" json:"accrued_yield_nanoton"`
	LastAccrualAt       time.Time   `json:"last_accrual_at"`
	StakedAt            time.Time   `gorm:"not null" json:"staked_at"`
	UnstakedAt          *time.Time  `json:"unstaked_at,omitempty"`
	IsActive            bool        `gorm:"not null;default:true;index" json:"is_active"`
	CreatedAt           time.Time   `json:"created_at"`
	UpdatedAt           time.Time   `json:"updated_at"`

	User          User          `gorm:"foreignKey:UserID" json:"-"`
	InventoryItem InventoryItem `gorm:"foreignKey:InventoryItemID" json:"-"`
}

type UserStakingSnapshot struct {
	UserID                     uuid.UUID  `gorm:"type:uuid;primaryKey" json:"user_id"`
	Rolling7DayRouletteWager   int64      `gorm:"not null;default:0" json:"rolling_7day_roulette_wager"`
	BoostEligible              bool       `gorm:"not null;default:false" json:"boost_eligible"`
	LastRouletteBetAt          *time.Time `json:"last_roulette_bet_at,omitempty"`
	ComputedAt                 time.Time  `gorm:"not null" json:"computed_at"`
	UpdatedAt                  time.Time  `json:"updated_at"`
}
