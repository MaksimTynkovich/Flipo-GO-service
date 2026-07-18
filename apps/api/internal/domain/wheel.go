package domain

import (
	"time"

	"github.com/google/uuid"
)

const (
	WheelSpinSourceDaily = "daily"
	WheelSpinSourceBonus = "bonus"
	WheelSpinSourceAdmin = "admin"
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
	UserID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"user_id"`
	BonusSpins        int        `gorm:"not null;default:0" json:"bonus_spins"`
	LastDailySpinDate *time.Time `gorm:"type:date" json:"last_daily_spin_date,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
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

type WheelRecentWin struct {
	Username      string    `json:"username"`
	FirstName     string    `json:"first_name"`
	PrizeNanoton  int64     `json:"prize_nanoton"`
	SegmentLabel  string    `json:"segment_label"`
	CreatedAt     time.Time `json:"created_at"`
}
