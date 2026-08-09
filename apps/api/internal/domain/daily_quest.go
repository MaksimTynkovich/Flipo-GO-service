package domain

import (
	"time"

	"github.com/google/uuid"
)

const (
	DailyQuestObjectiveOpenCases       = "open_cases"
	DailyQuestObjectiveInviteReferrals = "invite_referrals"

	DailyQuestRewardBalance  = "balance_nanoton"
	DailyQuestRewardFreeCase = "free_case_open"
	DailyQuestRewardGift     = "gift"

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
	ObjectiveType   string     `gorm:"size:32;not null" json:"objective_type"`
	ObjectiveTarget int        `gorm:"not null" json:"objective_target"`
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
	UpdatedAt                  time.Time  `json:"updated_at"`
}

func (DailyQuestBoardSettings) TableName() string { return "daily_quest_board_settings" }

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
