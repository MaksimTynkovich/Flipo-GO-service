package domain

import (
	"time"

	"github.com/google/uuid"
)

const (
	DailyQuestObjectiveOpenCases       = "open_cases"
	DailyQuestObjectiveOpenCasesSpend  = "open_cases_spend"
	DailyQuestObjectiveInviteReferrals = "invite_referrals"
	DailyQuestObjectiveWagerRoulette   = "wager_roulette"
	DailyQuestObjectiveWagerCrash      = "wager_crash"
	// RouletteWinMult — count roulette wins whose color multiplier >= ObjectiveParam/100 (e.g. 5000 = ×50).
	DailyQuestObjectiveRouletteWinMult = "roulette_win_mult"
	// CrashCashoutMult — count crash cashouts with cashout_multiplier >= ObjectiveParam/100 (e.g. 200 = ×2).
	DailyQuestObjectiveCrashCashoutMult = "crash_cashout_mult"
	// RouletteColorStreak — max consecutive correct roulette rounds (ObjectiveTarget = streak length).
	DailyQuestObjectiveRouletteColorStreak = "roulette_color_streak"

	DailyQuestRewardBalance  = "balance_nanoton"
	DailyQuestRewardFreeCase = "free_case_open"
	DailyQuestRewardGift     = "gift"
	DailyQuestRewardNone     = "none"

	DailyQuestClaimTask  = "task"
	DailyQuestClaimBonus = "bonus"

	// QuestClaimTxRefPrefix marks inventory items granted by daily quest claims.
	QuestClaimTxRefPrefix  = "quest:"
	QuestClaimMetaClaimID  = "quest_claim_id"
	QuestClaimMetaSource   = "source"
	QuestClaimSourceDaily  = "daily_quest"

	CaseEntitlementSourceDailyQuest = "daily_quest"
	CaseEntitlementAvailable        = "available"
	CaseEntitlementUsed             = "used"

	CaseOpenSourceQuest = "quest"
)

// DailyQuest — catalog entry for a small daily task.
type DailyQuest struct {
	ID              uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Title           string     `gorm:"size:256;not null" json:"title"`
	Description     string     `gorm:"type:text;not null;default:''" json:"description"`
	SortOrder       int        `gorm:"not null;default:0" json:"sort_order"`
	Active          bool       `gorm:"not null;default:true" json:"active"`
	ActiveFrom      *time.Time `gorm:"type:date" json:"active_from,omitempty"`
	ActiveTo        *time.Time `gorm:"type:date" json:"active_to,omitempty"`
	ObjectiveType   string     `gorm:"size:48;not null" json:"objective_type"`
	ObjectiveTarget int64      `gorm:"not null" json:"objective_target"`
	// ObjectiveParam — type-specific threshold (multiplier in hundredths for *_mult objectives).
	ObjectiveParam  int64      `gorm:"not null;default:0" json:"objective_param"`
	ObjectiveCaseID *uuid.UUID `gorm:"type:uuid" json:"objective_case_id,omitempty"`
	RewardType           string     `gorm:"size:32;not null" json:"reward_type"`
	RewardNanoton        int64      `gorm:"not null;default:0" json:"reward_nanoton"`
	RewardCaseID         *uuid.UUID `gorm:"type:uuid" json:"reward_case_id,omitempty"`
	RewardCollectionSlug string     `gorm:"size:128;not null;default:''" json:"reward_collection_slug"`
	RewardModelName      string     `gorm:"size:128;not null;default:''" json:"reward_model_name"`
	RewardGiftName       string     `gorm:"size:256;not null;default:''" json:"reward_gift_name"`
	RewardGiftImageURL   string     `gorm:"type:text;not null;default:''" json:"reward_gift_image_url"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

func (DailyQuest) TableName() string { return "daily_quests" }

// DailyQuestBoardSettings — singleton bonus for completing all tasks today.
type DailyQuestBoardSettings struct {
	ID                         int        `gorm:"primaryKey" json:"id"`
	BonusTitle                 string     `gorm:"size:256;not null;default:'Бонус дня'" json:"bonus_title"`
	BonusDescription           string     `gorm:"type:text;not null;default:''" json:"bonus_description"`
	BonusRewardType            string     `gorm:"size:32;not null;default:'balance_nanoton'" json:"bonus_reward_type"`
	BonusRewardNanoton         int64      `gorm:"not null;default:0" json:"bonus_reward_nanoton"`
	BonusRewardCaseID          *uuid.UUID `gorm:"type:uuid" json:"bonus_reward_case_id,omitempty"`
	BonusRewardCollectionSlug  string     `gorm:"size:128;not null;default:''" json:"bonus_reward_collection_slug"`
	BonusRewardModelName       string     `gorm:"size:128;not null;default:''" json:"bonus_reward_model_name"`
	BonusRewardGiftName        string     `gorm:"size:256;not null;default:''" json:"bonus_reward_gift_name"`
	BonusRewardGiftImageURL    string     `gorm:"type:text;not null;default:''" json:"bonus_reward_gift_image_url"`
	BonusActive                bool       `gorm:"not null;default:false" json:"bonus_active"`
	// ProgressEpoch — admin global reset: count progress only after this instant (if after day start).
	ProgressEpoch *time.Time `json:"progress_epoch,omitempty"`
	// PromoSlides — cases-page quest promo carousel (admin-editable).
	PromoSlides []DailyQuestPromoSlide `gorm:"type:jsonb;serializer:json;not null;default:'[]'" json:"promo_slides"`
	UpdatedAt   time.Time              `json:"updated_at"`
}

func (DailyQuestBoardSettings) TableName() string { return "daily_quest_board_settings" }

// DailyQuestPromoSlide — one slide in the cases catalog quest banner.
type DailyQuestPromoSlide struct {
	ID       string `json:"id"`
	Tone     string `json:"tone"`
	Eyebrow  string `json:"eyebrow"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
	CTA      string `json:"cta"`
	// CTAColor — hex text color for the white pill CTA.
	CTAColor string `json:"cta_color,omitempty"`
	CTABold  bool   `json:"cta_bold,omitempty"`
	// Per-line text colors (hex). Empty = CSS tone defaults.
	EyebrowColor  string `json:"eyebrow_color,omitempty"`
	TitleColor    string `json:"title_color,omitempty"`
	SubtitleColor string `json:"subtitle_color,omitempty"`
	// AccentColor — color for **marked** spans inside title/subtitle/eyebrow.
	AccentColor string `json:"accent_color,omitempty"`
	EyebrowBold  bool `json:"eyebrow_bold,omitempty"`
	TitleBold    bool `json:"title_bold,omitempty"`
	SubtitleBold bool `json:"subtitle_bold,omitempty"`
	// TitleSize — sm | md | lg (empty = md).
	TitleSize string `json:"title_size,omitempty"`
	CoverURL  string `json:"cover_url"`
	Active    bool   `json:"active"`
}

// DefaultDailyQuestPromoSlides — seed content matching historical hardcoded banner.
func DefaultDailyQuestPromoSlides() []DailyQuestPromoSlide {
	return []DailyQuestPromoSlide{
		{
			ID:       "duo",
			Tone:     "duo",
			Eyebrow:  "Супер-акция",
			Title:    "1+1 на кейсы",
			Subtitle: "Открой кейс — второй бесплатно",
			CTA:      "К заданиям",
			CoverURL: "/cases/covers/quest-promo-2x.webp",
			Active:   true,
		},
		{
			ID:       "open",
			Tone:     "open",
			Eyebrow:  "Задание дня",
			Title:    "Открой кейс",
			Subtitle: "Выполни цель и забери награду",
			CTA:      "Смотреть",
			CoverURL: "/cases/covers/quest-promo-open.webp",
			Active:   true,
		},
	}
}

// DailyQuestProgressBaseline — per-user progress watermark for an MSK day (admin reset).
type DailyQuestProgressBaseline struct {
	UserID         uuid.UUID `gorm:"type:uuid;primaryKey" json:"user_id"`
	DayMSK         time.Time `gorm:"type:date;primaryKey" json:"day_msk"`
	ProgressSince  time.Time `gorm:"not null" json:"progress_since"`
}

func (DailyQuestProgressBaseline) TableName() string { return "daily_quest_progress_baselines" }

// DailyQuestClaim — one claim per task (or board bonus) per MSK day.
type DailyQuestClaim struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID        uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	DayMSK        time.Time  `gorm:"type:date;not null" json:"day_msk"`
	ClaimKind     string     `gorm:"size:16;not null" json:"claim_kind"`
	QuestID       *uuid.UUID `gorm:"type:uuid" json:"quest_id,omitempty"`
	RewardType    string     `gorm:"size:32;not null" json:"reward_type"`
	RewardNanoton int64      `gorm:"not null;default:0" json:"reward_nanoton"`
	RewardCaseID  *uuid.UUID `gorm:"type:uuid" json:"reward_case_id,omitempty"`
	EntitlementID *uuid.UUID `gorm:"type:uuid" json:"entitlement_id,omitempty"`
	ClaimedAt     time.Time  `gorm:"not null" json:"claimed_at"`
}

func (DailyQuestClaim) TableName() string { return "daily_quest_claims" }

// UserCaseEntitlement — free case open granted by a quest claim.
type UserCaseEntitlement struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	CaseID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"case_id"`
	Source    string     `gorm:"size:32;not null" json:"source"`
	SourceRef uuid.UUID  `gorm:"type:uuid;not null" json:"source_ref"`
	Status    string     `gorm:"size:16;not null;default:'available'" json:"status"`
	CreatedAt time.Time  `json:"created_at"`
	UsedAt    *time.Time `json:"used_at,omitempty"`
}

func (UserCaseEntitlement) TableName() string { return "user_case_entitlements" }
