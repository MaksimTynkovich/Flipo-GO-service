package domain

import (
	"time"

	"github.com/google/uuid"
)

const (
	CampaignStatusActive   = "active"
	CampaignStatusArchived = "archived"

	CampaignSourceTelegramAds = "telegram_ads"
	CampaignSourceChannel     = "channel"
	CampaignSourceStories     = "stories"
	CampaignSourceInfluencer  = "influencer"
	CampaignSourceOther       = "other"

	CampaignLandingCases = "cases"
	CampaignLandingGames = "games"
	CampaignLandingCrash = "crash"
)

type Campaign struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Code      string    `gorm:"size:24;uniqueIndex;not null" json:"code"`
	Name      string    `gorm:"size:128;not null" json:"name"`
	Source    string    `gorm:"size:32;not null;index" json:"source"`
	Content   string    `gorm:"size:64" json:"content,omitempty"`
	Landing   string    `gorm:"size:16" json:"landing,omitempty"`
	Status    string    `gorm:"size:16;not null;index;default:active" json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Campaign) TableName() string { return "campaigns" }

type CampaignStats struct {
	Campaign
	StartParam       string  `json:"start_param"`
	MiniAppURL       string  `json:"mini_app_url"`
	BotStartURL      string  `json:"bot_start_url"`
	Clicks           int64   `json:"clicks"`
	AppOpens         int64   `json:"app_opens"`
	NewUsers         int64   `json:"new_users"`
	Depositors       int64   `json:"depositors"`
	DepositsNanoton  int64   `json:"deposits_nanoton"`
	Bettors          int64   `json:"bettors"`
	BetVolumeNanoton int64   `json:"bet_volume_nanoton"`
	GGRNanoton       int64   `json:"ggr_nanoton"`
	ClickToRegPct    float64 `json:"click_to_reg_pct"`
	RegToDepositPct  float64 `json:"reg_to_deposit_pct"`
	RegToBetPct      float64 `json:"reg_to_bet_pct"`
}

type CampaignDailyPoint struct {
	Date            string `json:"date"`
	Clicks          int64  `json:"clicks"`
	AppOpens        int64  `json:"app_opens"`
	NewUsers        int64  `json:"new_users"`
	DepositsNanoton int64  `json:"deposits_nanoton"`
}

type CampaignDetail struct {
	CampaignStats
	Daily []CampaignDailyPoint `json:"daily"`
}

type CampaignStatsFilter struct {
	From   time.Time
	To     time.Time
	Source string
}
