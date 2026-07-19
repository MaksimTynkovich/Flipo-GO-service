package domain

import (
	"time"

	"github.com/google/uuid"
)

const (
	WheelSpinSourceDaily = "daily"
	WheelSpinSourceBonus = "bonus"
	WheelSpinSourceAdmin = "admin"

	// MaxReferralBonusSpinsPerDay caps spins a referrer can earn from invites (MSK day).
	MaxReferralBonusSpinsPerDay = 10
)

type WheelSegment struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Label          string    `gorm:"size:64;not null" json:"label"`
	AmountNanoton  int64     `gorm:"not null" json:"amount_nanoton"`
	Weight         int       `gorm:"not null" json:"weight"`
	SortOrder      int       `gorm:"not null;default:0" json:"sort_order"`
	Active         bool      `gorm:"not null;default:true" json:"active"`
	CreatedAt      time.Time `json:"created_at"`
}

func (WheelSegment) TableName() string { return "wheel_segments" }

type UserWheelState struct {
	UserID                   uuid.UUID  `gorm:"type:uuid;primaryKey" json:"user_id"`
	BonusSpins               int        `gorm:"not null;default:0" json:"bonus_spins"`
	LastDailySpinDate        *time.Time `gorm:"type:date" json:"last_daily_spin_date,omitempty"`
	ReferralBonusGrantsToday int        `gorm:"not null;default:0" json:"referral_bonus_grants_today"`
	ReferralBonusGrantsDate  *time.Time `gorm:"type:date" json:"referral_bonus_grants_date,omitempty"`
	CreatedAt                time.Time  `json:"created_at"`
	UpdatedAt                time.Time  `json:"updated_at"`
}

func (UserWheelState) TableName() string { return "user_wheel_state" }

type WheelSpin struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID        uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	SegmentID     uuid.UUID `gorm:"type:uuid;not null" json:"segment_id"`
	PrizeNanoton  int64     `gorm:"not null" json:"prize_nanoton"`
	SpinSource    string    `gorm:"size:16;not null" json:"spin_source"`
	RngRoll       int       `gorm:"not null" json:"rng_roll"`
	CreatedAt     time.Time `gorm:"index" json:"created_at"`
}

func (WheelSpin) TableName() string { return "wheel_spins" }

// WheelSpinOverride — one-shot forced prize for a user's next wheel spin.
type WheelSpinOverride struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	SegmentID  uuid.UUID  `gorm:"type:uuid;not null" json:"segment_id"`
	CreatedBy  uuid.UUID  `gorm:"type:uuid;not null" json:"created_by"`
	Note       string     `gorm:"size:256" json:"note,omitempty"`
	ConsumedAt *time.Time `json:"consumed_at,omitempty"`
	CreatedAt  time.Time  `gorm:"index" json:"created_at"`
}

func (WheelSpinOverride) TableName() string { return "wheel_spin_overrides" }

// WheelSpinOverrideView — pending override with user + segment labels for admin UI.
type WheelSpinOverrideView struct {
	ID              uuid.UUID `json:"id"`
	UserID          uuid.UUID `json:"user_id"`
	TelegramID      int64     `json:"telegram_id"`
	Username        string    `json:"username"`
	FirstName       string    `json:"first_name"`
	SegmentID       uuid.UUID `json:"segment_id"`
	SegmentLabel    string    `json:"segment_label"`
	AmountNanoton   int64     `json:"amount_nanoton"`
	Note            string    `json:"note,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

type WheelRecentWin struct {
	Username      string    `json:"username"`
	FirstName     string    `json:"first_name"`
	PhotoURL      string    `json:"photo_url,omitempty"`
	PrizeNanoton  int64     `json:"prize_nanoton"`
	SegmentLabel  string    `json:"segment_label"`
	CreatedAt     time.Time `json:"created_at"`
}

// WheelPeriodStats aggregates non-admin spins for a time window.
type WheelPeriodStats struct {
	Spins         int64
	UniqueUsers   int64
	PrizesNanoton int64
}

// WheelSourceStats aggregates non-admin spins by spin_source.
type WheelSourceStats struct {
	Source        string
	Spins         int64
	PrizesNanoton int64
}

// WheelSegmentHitStats aggregates non-admin prize hits by segment.
type WheelSegmentHitStats struct {
	SegmentID          uuid.UUID
	Label              string
	AmountNanoton      int64
	Hits               int64
	TotalPrizesNanoton int64
}

// WheelDailyStats aggregates non-admin spins for one UTC calendar day.
type WheelDailyStats struct {
	Date          time.Time
	Spins         int64
	UniqueUsers   int64
	PrizesNanoton int64
}
