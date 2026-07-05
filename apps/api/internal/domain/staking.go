package domain

import (
	"time"

	"github.com/google/uuid"
)

type StakingEpochStatus string

const (
	EpochActive  StakingEpochStatus = "active"
	EpochSettled StakingEpochStatus = "settled"
)

type StakingEpoch struct {
	ID        uuid.UUID          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	StartsAt  time.Time          `gorm:"not null;index" json:"starts_at"`
	EndsAt    time.Time          `gorm:"not null;index" json:"ends_at"`
	Status    StakingEpochStatus `gorm:"type:varchar(16);not null;index" json:"status"`
	CreatedAt time.Time          `json:"created_at"`
	UpdatedAt time.Time          `json:"updated_at"`
}

func (StakingEpoch) TableName() string { return "staking_epochs" }

type StakingSource string

const (
	StakingSourceProfile   StakingSource = "profile"
	StakingSourceInventory StakingSource = "inventory"
)

type StakingRevokeReason string

const (
	StakingRevokedSuperseded StakingRevokeReason = "superseded"
	StakingRevokedEpochEnd   StakingRevokeReason = "epoch_end"
)

type StakingPosition struct {
	ID                  uuid.UUID           `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID              uuid.UUID           `gorm:"type:uuid;not null;index" json:"user_id"`
	InventoryItemID     uuid.UUID           `gorm:"type:uuid;not null;index" json:"inventory_item_id"`
	EpochID             uuid.UUID           `gorm:"type:uuid;not null;index" json:"epoch_id"`
	GiftSlug            string              `gorm:"size:128;not null;index" json:"gift_slug"`
	Source              StakingSource       `gorm:"type:varchar(16);not null" json:"source"`
	TierAtStake         StakingTier         `gorm:"type:varchar(16);not null" json:"tier_at_stake"`
	PrincipalNanoton    int64               `gorm:"not null" json:"principal_nanoton"`
	AccruedYieldNanoton int64               `gorm:"not null;default:0" json:"accrued_yield_nanoton"`
	LastAccrualAt       time.Time           `json:"last_accrual_at"`
	StakedAt            time.Time           `gorm:"not null" json:"staked_at"`
	UnstakedAt          *time.Time          `json:"unstaked_at,omitempty"`
	RevokedReason       *StakingRevokeReason `gorm:"type:varchar(32)" json:"revoked_reason,omitempty"`
	IsActive            bool                `gorm:"not null;default:true;index" json:"is_active"`
	CreatedAt           time.Time           `json:"created_at"`
	UpdatedAt           time.Time           `json:"updated_at"`

	User          User          `gorm:"foreignKey:UserID" json:"-"`
	InventoryItem InventoryItem `gorm:"foreignKey:InventoryItemID" json:"-"`
	Epoch         StakingEpoch  `gorm:"foreignKey:EpochID" json:"-"`
}

func (StakingPosition) TableName() string { return "staking_positions" }

type StakingGiftClaim struct {
	GiftSlug   string    `gorm:"primaryKey;size:128" json:"gift_slug"`
	UserID     uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	PositionID uuid.UUID `gorm:"type:uuid;not null" json:"position_id"`
	EpochID    uuid.UUID `gorm:"type:uuid;not null;index" json:"epoch_id"`
	CreatedAt  time.Time `json:"created_at"`
}

func (StakingGiftClaim) TableName() string { return "staking_gift_claims" }

type UserStakingSnapshot struct {
	UserID                   uuid.UUID  `gorm:"type:uuid;primaryKey" json:"user_id"`
	Rolling7DayRouletteWager int64      `gorm:"not null;default:0" json:"rolling_7day_roulette_wager"`
	BoostEligible            bool       `gorm:"not null;default:false" json:"boost_eligible"`
	LastRouletteBetAt        *time.Time `json:"last_roulette_bet_at,omitempty"`
	ComputedAt               time.Time  `gorm:"not null" json:"computed_at"`
	UpdatedAt                time.Time  `json:"updated_at"`
}
