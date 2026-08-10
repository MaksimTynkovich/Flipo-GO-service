package domain

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const (
	CaseKindCatalog  = "catalog"
	CaseKindFeatured = "featured"
	CaseKindDaily    = "daily"
	CaseKindPromo    = "promo"

	CaseOpenSourcePaid  = "paid"
	CaseOpenSourceDaily = "daily"
	CaseOpenSourceFree  = "free"
	CaseOpenSourcePromo = "promo"

	CaseClaimTxRefPrefix = "case:"

	CaseFulfillmentUnbacked = "unbacked"
	CaseFulfillmentBacked   = "backed"

	CasePrizeTypeGift = "gift"
	CasePrizeTypeTon  = "ton"

	CaseClaimMetaCollection     = "collection"
	CaseClaimMetaModel          = "model"
	CaseClaimMetaBackdrop       = "backdrop"
	CaseClaimMetaSymbol         = "symbol"
	CaseClaimMetaFulfillment    = "fulfillment"
	CaseClaimMetaCashoutNanoton = "case_cashout_nanoton"
	CaseClaimMetaCaseID         = "case_id"
	CaseClaimMetaCaseSlug       = "case_slug"
	CaseClaimMetaLootEntryID    = "loot_entry_id"
)

type Case struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Slug           string         `gorm:"size:64;not null;index" json:"slug"`
	Title          string         `gorm:"size:128;not null" json:"title"`
	ImageURL       string         `gorm:"size:512" json:"image_url"`
	AccentColor    string         `gorm:"size:32" json:"accent_color"`
	PriceNanoton   int64          `gorm:"not null" json:"price_nanoton"`
	Kind           string         `gorm:"size:16;not null;index" json:"kind"`
	SortOrder      int            `gorm:"not null;default:0" json:"sort_order"`
	Active         bool           `gorm:"not null;default:true;index" json:"active"`
	RequireChannel bool           `gorm:"not null;default:false" json:"require_channel"`
	// RequiredNameTag — if non-empty, first_name or last_name must contain this substring (case-insensitive).
	RequiredNameTag string `gorm:"size:64;not null;default:''" json:"required_name_tag"`
	// RequireShare — user must record at least one share click for this case before opening.
	RequireShare bool `gorm:"not null;default:false" json:"require_share"`
	TargetRTPBPS int  `gorm:"column:target_rtp_bps;not null;default:9000" json:"target_rtp_bps"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Case) TableName() string { return "cases" }

type CaseLootEntry struct {
	ID                  uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CaseID              uuid.UUID `gorm:"type:uuid;not null;index" json:"case_id"`
	PrizeType           string    `gorm:"size:16;not null;default:gift" json:"prize_type"`
	CollectionSlug      string    `gorm:"size:128;not null;default:''" json:"collection_slug"`
	CollectionName      string    `gorm:"size:128;not null;default:''" json:"collection_name"`
	ModelName           string    `gorm:"size:128;not null;default:''" json:"model_name"`
	Backdrop            string    `gorm:"size:32;not null;default:''" json:"backdrop"`
	Weight              int       `gorm:"not null" json:"weight"`
	DisplayName         string    `gorm:"size:128;not null" json:"display_name"`
	ImageURL            string    `gorm:"size:512" json:"image_url"`
	RarityLabel         string    `gorm:"size:64" json:"rarity_label"`
	TileBackgroundColor string    `gorm:"size:16" json:"tile_background_color"`
	SortOrder           int       `gorm:"not null;default:0" json:"sort_order"`
	FloorPriceNanoton   int64     `gorm:"not null;default:0" json:"floor_price_nanoton"`
	AmountNanoton       int64     `gorm:"not null;default:0" json:"amount_nanoton"`
	CreatedAt           time.Time `json:"created_at"`
}

func (CaseLootEntry) TableName() string { return "case_loot_entries" }

type CaseOpen struct {
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID           uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	CaseID           uuid.UUID  `gorm:"type:uuid;not null;index" json:"case_id"`
	PricePaidNanoton int64      `gorm:"not null" json:"price_paid_nanoton"`
	// AdminFundedNanoton — part of PricePaidNanoton covered by remaining admin_adjust credit.
	AdminFundedNanoton int64      `gorm:"not null;default:0" json:"admin_funded_nanoton"`
	Source             string     `gorm:"size:16;not null" json:"source"`
	RngRoll            int        `gorm:"not null" json:"rng_roll"`
	LootEntryID        uuid.UUID  `gorm:"type:uuid;not null" json:"loot_entry_id"`
	InventoryItemID    *uuid.UUID `gorm:"type:uuid" json:"inventory_item_id,omitempty"`
	PrizeType          string     `gorm:"size:16;not null;default:gift" json:"prize_type"`
	PrizeNanoton       int64      `gorm:"not null;default:0" json:"prize_nanoton"`
	IdempotencyKey     string     `gorm:"size:128;not null;uniqueIndex" json:"idempotency_key"`
	CreatedAt          time.Time  `gorm:"index" json:"created_at"`
}

func (CaseOpen) TableName() string { return "case_opens" }

type UserCaseState struct {
	UserID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"user_id"`
	LastDailyOpenDate *time.Time `gorm:"type:date" json:"last_daily_open_date,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

func (UserCaseState) TableName() string { return "user_case_state" }

// UserCaseCooldown — atomic claim for daily/free case 24h opens (prevents parallel bypass).
type UserCaseCooldown struct {
	UserID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"user_id"`
	CaseID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"case_id"`
	LastClaimedAt   time.Time  `gorm:"not null;index" json:"last_claimed_at"`
	ReadyNotifiedAt *time.Time `json:"ready_notified_at,omitempty"` // Telegram "daily ready" for this claim cycle
}

// CaseCooldownReadyNotify — row ready for "daily case available" Telegram push.
type CaseCooldownReadyNotify struct {
	UserID     uuid.UUID
	CaseID     uuid.UUID
	TelegramID int64
	CaseTitle  string
	CaseSlug   string
}

func (UserCaseCooldown) TableName() string { return "user_case_cooldowns" }

// CaseCatalogSettings — singleton (id=1) for catalog UI knobs + case economy pools.
type CaseCatalogSettings struct {
	ID             int       `gorm:"primaryKey" json:"id"`
	Enabled        bool      `gorm:"not null;default:true" json:"enabled"`
	BannersEnabled bool      `gorm:"not null;default:false" json:"banners_enabled"`
	UpdatedAt      time.Time `json:"updated_at"`

	// Paid Case Bank (catalog / featured / free-channel opens).
	BankEnabled               bool  `gorm:"not null;default:false" json:"bank_enabled"`
	BankNanoton               int64 `gorm:"not null;default:0" json:"bank_nanoton"`
	BankTargetNanoton         int64 `gorm:"not null;default:0" json:"bank_target_nanoton"`
	BankLossThresholdNanoton  int64 `gorm:"not null;default:-50000000000" json:"bank_loss_threshold_nanoton"`
	BankRecoveryTargetNanoton int64 `gorm:"not null;default:0" json:"bank_recovery_target_nanoton"`
	BankRecoveryActive        bool  `gorm:"not null;default:false" json:"bank_recovery_active"`
	BankBiasWeight            int   `gorm:"not null;default:50" json:"bank_bias_weight"`
	BankMaxPrizeBps           int   `gorm:"not null;default:5000" json:"bank_max_prize_bps"`
	BankFatPaused             bool  `gorm:"not null;default:false" json:"bank_fat_paused"`

	// Smooth recovery — paced drain/relief instead of 100% cheapest prizes.
	BankRecoverySmoothEnabled     bool `gorm:"not null;default:true" json:"bank_recovery_smooth_enabled"`
	BankRecoveryDrainOpens        int  `gorm:"not null;default:2" json:"bank_recovery_drain_opens"`
	BankRecoveryReliefOpens       int  `gorm:"not null;default:1" json:"bank_recovery_relief_opens"`
	BankRecoveryReliefMaxPrizeBps int  `gorm:"not null;default:3000" json:"bank_recovery_relief_max_prize_bps"`
	BankRecoveryPaceCounter       int  `gorm:"not null;default:0" json:"bank_recovery_pace_counter"`

	// Daily pool — isolated budget for daily cases.
	DailyPoolEnabled            bool       `gorm:"not null;default:false" json:"daily_pool_enabled"`
	DailyPoolNanoton            int64      `gorm:"not null;default:0" json:"daily_pool_nanoton"`
	DailyPoolMaxPrizeBps        int        `gorm:"not null;default:5000" json:"daily_pool_max_prize_bps"`
	DailyPoolDailyRefillNanoton int64      `gorm:"not null;default:0" json:"daily_pool_daily_refill_nanoton"`
	DailyPoolLastRefillDate     *time.Time `gorm:"type:date" json:"daily_pool_last_refill_date,omitempty"`

	// Promo pool — isolated budget for promo cases.
	PromoPoolEnabled            bool       `gorm:"not null;default:false" json:"promo_pool_enabled"`
	PromoPoolNanoton            int64      `gorm:"not null;default:0" json:"promo_pool_nanoton"`
	PromoPoolMaxPrizeBps        int        `gorm:"not null;default:5000" json:"promo_pool_max_prize_bps"`
	PromoPoolDailyRefillNanoton int64      `gorm:"not null;default:0" json:"promo_pool_daily_refill_nanoton"`
	PromoPoolLastRefillDate     *time.Time `gorm:"type:date" json:"promo_pool_last_refill_date,omitempty"`

	// Deposit surplus boost — better mid/fat odds for depositors when paid bank is healthy.
	DepositBoostEnabled    bool  `gorm:"not null;default:true" json:"deposit_boost_enabled"`
	DepositBoostMinNanoton int64 `gorm:"not null;default:10000000000" json:"deposit_boost_min_nanoton"` // 10 TON
	DepositBoostBiasWeight int   `gorm:"not null;default:40" json:"deposit_boost_bias_weight"`          // +40% on >= median

	// Adaptive deposit tiers + reserve-first surplus gating.
	DepositBoostTier1MinNanoton int64 `gorm:"not null;default:1000000000" json:"deposit_boost_tier1_min_nanoton"`
	DepositBoostTier2MinNanoton int64 `gorm:"not null;default:2000000000" json:"deposit_boost_tier2_min_nanoton"`
	DepositBoostTier3MinNanoton int64 `gorm:"not null;default:5000000000" json:"deposit_boost_tier3_min_nanoton"`
	DepositBoostTier4MinNanoton int64 `gorm:"not null;default:10000000000" json:"deposit_boost_tier4_min_nanoton"`
	DepositBoostTier1BiasWeight int   `gorm:"not null;default:0" json:"deposit_boost_tier1_bias_weight"`
	DepositBoostTier2BiasWeight int   `gorm:"not null;default:5" json:"deposit_boost_tier2_bias_weight"`
	DepositBoostTier3BiasWeight int   `gorm:"not null;default:10" json:"deposit_boost_tier3_bias_weight"`
	DepositBoostTier4BiasWeight int   `gorm:"not null;default:15" json:"deposit_boost_tier4_bias_weight"`
	DepositBoostSurplusShareBps int   `gorm:"not null;default:2500" json:"deposit_boost_surplus_share_bps"` // 25% of surplus may fuel boost
	DepositBoostRampNanoton     int64 `gorm:"not null;default:10000000000" json:"deposit_boost_ramp_nanoton"` // full boost after 10 TON allocatable surplus
}

func (CaseCatalogSettings) TableName() string { return "case_catalog_settings" }

// CaseOpenStats — aggregate P&L from case_opens for admin.
type CaseOpenStats struct {
	OpensCount        int64 `json:"opens_count"`
	SpentNanoton      int64 `json:"spent_nanoton"`
	PrizeTotalNanoton int64 `json:"prize_total_nanoton"`
	HouseEdgeNanoton  int64 `json:"house_edge_nanoton"`
	ActualRTPBPS      int   `json:"actual_rtp_bps"`

	// Organic* excludes admin_adjust-funded spend so Live P&L reflects live money.
	OrganicOpensCount        int64 `json:"organic_opens_count"`
	OrganicSpentNanoton      int64 `json:"organic_spent_nanoton"`
	OrganicPrizeNanoton      int64 `json:"organic_prize_nanoton"`
	OrganicEdgeNanoton       int64 `json:"organic_edge_nanoton"`
	OrganicRTPBPS            int   `json:"organic_rtp_bps"`
	AdminFundedOpensCount    int64 `json:"admin_funded_opens_count"`
	AdminFundedSpentNanoton  int64 `json:"admin_funded_spent_nanoton"`
	AdminFundedPrizeNanoton  int64 `json:"admin_funded_prize_nanoton"`
	AdminFundedEdgeNanoton   int64 `json:"admin_funded_edge_nanoton"`
}

// CaseOpenPeriodStats — opens P&L for a time window (nil/zero since = all time).
type CaseOpenPeriodStats struct {
	Opens             int64
	UniqueUsers       int64
	SpentNanoton      int64
	PrizeTotalNanoton int64
	PaidOpens         int64
	FreeOpens         int64
	PaidSpentNanoton  int64
	PaidPrizeNanoton  int64
}

// CaseOpenSourceStats — opens grouped by source (paid/daily/free/promo).
type CaseOpenSourceStats struct {
	Source            string
	Opens             int64
	UniqueUsers       int64
	SpentNanoton      int64
	PrizeTotalNanoton int64
}

// CaseOpenPrizeTypeStats — opens grouped by gift/ton.
type CaseOpenPrizeTypeStats struct {
	PrizeType         string
	Opens             int64
	PrizeTotalNanoton int64
}

// CaseOpenCaseStats — per-case aggregate for admin rankings.
type CaseOpenCaseStats struct {
	CaseID            uuid.UUID
	Title             string
	Slug              string
	ImageURL          string
	Kind              string
	PriceNanoton      int64
	SortOrder         int
	Active            bool
	Opens             int64
	SpentNanoton      int64
	PrizeTotalNanoton int64
}

// CaseOpenPrizeHitStats — top loot entries by hit count.
type CaseOpenPrizeHitStats struct {
	LootEntryID       uuid.UUID
	Label             string
	PrizeType         string
	Hits              int64
	PrizeTotalNanoton int64
}

// CaseOpenDailyStats — UTC day bucket for opens timeseries.
type CaseOpenDailyStats struct {
	Date              time.Time
	Opens             int64
	UniqueUsers       int64
	SpentNanoton      int64
	PrizeTotalNanoton int64
}

// CasePoolKind selects which economy pool backs an open.
type CasePoolKind string

const (
	CasePoolPaid  CasePoolKind = "paid"
	CasePoolDaily CasePoolKind = "daily"
	CasePoolPromo CasePoolKind = "promo"

	CaseRecoveryPhaseDrain  = "drain"
	CaseRecoveryPhaseRelief = "relief"
)

// CasePoolForKind maps case kind to economy pool.
func CasePoolForKind(kind string) CasePoolKind {
	switch kind {
	case CaseKindDaily:
		return CasePoolDaily
	case CaseKindPromo:
		return CasePoolPromo
	default:
		return CasePoolPaid
	}
}

// NormalizeCaseRecoverySmooth clamps smooth-recovery knobs to safe ranges.
func NormalizeCaseRecoverySmooth(s *CaseCatalogSettings) {
	if s == nil {
		return
	}
	if s.BankRecoveryDrainOpens < 1 {
		s.BankRecoveryDrainOpens = 1
	}
	if s.BankRecoveryDrainOpens > 50 {
		s.BankRecoveryDrainOpens = 50
	}
	if s.BankRecoveryReliefOpens < 1 {
		s.BankRecoveryReliefOpens = 1
	}
	if s.BankRecoveryReliefOpens > 50 {
		s.BankRecoveryReliefOpens = 50
	}
	if s.BankRecoveryReliefMaxPrizeBps < 0 {
		s.BankRecoveryReliefMaxPrizeBps = 0
	}
	if s.BankRecoveryReliefMaxPrizeBps > 10000 {
		s.BankRecoveryReliefMaxPrizeBps = 10000
	}
	cycle := s.BankRecoveryDrainOpens + s.BankRecoveryReliefOpens
	if cycle > 0 && s.BankRecoveryPaceCounter >= cycle {
		s.BankRecoveryPaceCounter %= cycle
	}
	if s.BankRecoveryPaceCounter < 0 {
		s.BankRecoveryPaceCounter = 0
	}
}

// CaseRecoveryPhase returns drain|relief for the current pace counter (paid smooth recovery).
func CaseRecoveryPhase(drainOpens, reliefOpens, paceCounter int) string {
	if drainOpens < 1 {
		drainOpens = 1
	}
	if reliefOpens < 1 {
		reliefOpens = 1
	}
	cycle := drainOpens + reliefOpens
	idx := paceCounter
	if cycle > 0 {
		idx = paceCounter % cycle
	}
	if idx < 0 {
		idx = 0
	}
	if idx < drainOpens {
		return CaseRecoveryPhaseDrain
	}
	return CaseRecoveryPhaseRelief
}

// CaseRecoveryProgress is 0..1 how far bank has climbed from loss threshold toward recovery target.
func CaseRecoveryProgress(balance, lossThreshold, recoveryTarget int64) float64 {
	span := recoveryTarget - lossThreshold
	if span <= 0 {
		if balance >= recoveryTarget {
			return 1
		}
		return 0
	}
	p := float64(balance-lossThreshold) / float64(span)
	if p < 0 {
		return 0
	}
	if p > 1 {
		return 1
	}
	return p
}

// NormalizeDepositBoost clamps deposit-boost knobs.
func NormalizeDepositBoost(s *CaseCatalogSettings) {
	if s == nil {
		return
	}
	if s.DepositBoostMinNanoton < 0 {
		s.DepositBoostMinNanoton = 0
	}
	if s.DepositBoostBiasWeight < 0 {
		s.DepositBoostBiasWeight = 0
	}
	if s.DepositBoostBiasWeight > 100 {
		s.DepositBoostBiasWeight = 100
	}
	if s.DepositBoostTier1MinNanoton < 0 {
		s.DepositBoostTier1MinNanoton = 0
	}
	if s.DepositBoostTier2MinNanoton < s.DepositBoostTier1MinNanoton {
		s.DepositBoostTier2MinNanoton = s.DepositBoostTier1MinNanoton
	}
	if s.DepositBoostTier3MinNanoton < s.DepositBoostTier2MinNanoton {
		s.DepositBoostTier3MinNanoton = s.DepositBoostTier2MinNanoton
	}
	if s.DepositBoostTier4MinNanoton < s.DepositBoostTier3MinNanoton {
		s.DepositBoostTier4MinNanoton = s.DepositBoostTier3MinNanoton
	}
	clampWeight := func(v *int) {
		if *v < 0 {
			*v = 0
		}
		if *v > 100 {
			*v = 100
		}
	}
	clampWeight(&s.DepositBoostTier1BiasWeight)
	clampWeight(&s.DepositBoostTier2BiasWeight)
	clampWeight(&s.DepositBoostTier3BiasWeight)
	clampWeight(&s.DepositBoostTier4BiasWeight)
	if s.DepositBoostSurplusShareBps < 0 {
		s.DepositBoostSurplusShareBps = 0
	}
	if s.DepositBoostSurplusShareBps > 10000 {
		s.DepositBoostSurplusShareBps = 10000
	}
	if s.DepositBoostRampNanoton < 0 {
		s.DepositBoostRampNanoton = 0
	}
}

// SyncCaseBankHysteresis updates BankRecoveryActive from bank vs thresholds (paid pool only).
func SyncCaseBankHysteresis(s *CaseCatalogSettings) {
	if s == nil {
		return
	}
	if s.BankBiasWeight < 0 {
		s.BankBiasWeight = 0
	}
	if s.BankBiasWeight > 100 {
		s.BankBiasWeight = 100
	}
	if s.BankMaxPrizeBps < 0 {
		s.BankMaxPrizeBps = 0
	}
	if s.BankMaxPrizeBps > 10000 {
		s.BankMaxPrizeBps = 10000
	}
	if s.DailyPoolMaxPrizeBps < 0 {
		s.DailyPoolMaxPrizeBps = 0
	}
	if s.DailyPoolMaxPrizeBps > 10000 {
		s.DailyPoolMaxPrizeBps = 10000
	}
	if s.PromoPoolMaxPrizeBps < 0 {
		s.PromoPoolMaxPrizeBps = 0
	}
	if s.PromoPoolMaxPrizeBps > 10000 {
		s.PromoPoolMaxPrizeBps = 10000
	}
	NormalizeCaseRecoverySmooth(s)
	NormalizeDepositBoost(s)
	if !s.BankEnabled {
		s.BankRecoveryActive = false
		s.BankRecoveryPaceCounter = 0
		return
	}
	if s.BankRecoveryActive {
		if s.BankNanoton >= s.BankRecoveryTargetNanoton {
			s.BankRecoveryActive = false
			s.BankRecoveryPaceCounter = 0
		}
	} else if s.BankNanoton <= s.BankLossThresholdNanoton {
		s.BankRecoveryActive = true
	}
}

// CasePoolSnapshot is the active pool balance + gate knobs for one open.
type CasePoolSnapshot struct {
	Kind          CasePoolKind
	Enabled       bool
	Balance       int64
	MaxPrizeBps   int
	BiasWeight    int
	Recovery      bool
	FatPaused     bool
	TargetBalance int64 // paid bank target; 0 for daily/promo

	// Paid smooth recovery (zeroed for daily/promo).
	RecoverySmooth            bool
	RecoveryDrainOpens        int
	RecoveryReliefOpens       int
	RecoveryReliefMaxPrizeBps int
	RecoveryPaceCounter       int
	RecoveryPhase             string  // drain|relief when Recovery&&RecoverySmooth
	RecoveryProgress          float64 // 0..1 toward recovery target
	LossThreshold             int64
	RecoveryTarget            int64
}

func (s *CaseCatalogSettings) PoolSnapshot(kind CasePoolKind) CasePoolSnapshot {
	if s == nil {
		return CasePoolSnapshot{Kind: kind}
	}
	switch kind {
	case CasePoolDaily:
		return CasePoolSnapshot{
			Kind:        CasePoolDaily,
			Enabled:     s.DailyPoolEnabled,
			Balance:     s.DailyPoolNanoton,
			MaxPrizeBps: s.DailyPoolMaxPrizeBps,
			BiasWeight:  s.BankBiasWeight,
			Recovery:    s.DailyPoolEnabled && s.DailyPoolNanoton <= 0,
			FatPaused:   s.BankFatPaused,
		}
	case CasePoolPromo:
		return CasePoolSnapshot{
			Kind:        CasePoolPromo,
			Enabled:     s.PromoPoolEnabled,
			Balance:     s.PromoPoolNanoton,
			MaxPrizeBps: s.PromoPoolMaxPrizeBps,
			BiasWeight:  s.BankBiasWeight,
			Recovery:    s.PromoPoolEnabled && s.PromoPoolNanoton <= 0,
			FatPaused:   s.BankFatPaused,
		}
	default:
		snap := CasePoolSnapshot{
			Kind:                      CasePoolPaid,
			Enabled:                   s.BankEnabled,
			Balance:                   s.BankNanoton,
			MaxPrizeBps:               s.BankMaxPrizeBps,
			BiasWeight:                s.BankBiasWeight,
			Recovery:                  s.BankRecoveryActive,
			FatPaused:                 s.BankFatPaused,
			TargetBalance:             s.BankTargetNanoton,
			RecoverySmooth:            s.BankRecoverySmoothEnabled,
			RecoveryDrainOpens:        s.BankRecoveryDrainOpens,
			RecoveryReliefOpens:       s.BankRecoveryReliefOpens,
			RecoveryReliefMaxPrizeBps: s.BankRecoveryReliefMaxPrizeBps,
			RecoveryPaceCounter:       s.BankRecoveryPaceCounter,
			LossThreshold:             s.BankLossThresholdNanoton,
			RecoveryTarget:            s.BankRecoveryTargetNanoton,
		}
		if snap.Recovery && snap.RecoverySmooth {
			snap.RecoveryPhase = CaseRecoveryPhase(snap.RecoveryDrainOpens, snap.RecoveryReliefOpens, snap.RecoveryPaceCounter)
			snap.RecoveryProgress = CaseRecoveryProgress(snap.Balance, snap.LossThreshold, snap.RecoveryTarget)
		}
		return snap
	}
}

// AdvancePaidRecoveryPace bumps the drain/relief cycle counter when smooth recovery is active.
func AdvancePaidRecoveryPace(s *CaseCatalogSettings) {
	if s == nil || !s.BankEnabled || !s.BankRecoveryActive || !s.BankRecoverySmoothEnabled {
		return
	}
	NormalizeCaseRecoverySmooth(s)
	cycle := s.BankRecoveryDrainOpens + s.BankRecoveryReliefOpens
	if cycle <= 0 {
		return
	}
	s.BankRecoveryPaceCounter = (s.BankRecoveryPaceCounter + 1) % cycle
}

// MaxPrizeNanoton returns hard ceiling for a prize given pool balance (0 if disabled/empty).
func (p CasePoolSnapshot) MaxPrizeNanoton() int64 {
	if !p.Enabled || p.MaxPrizeBps <= 0 {
		return 0
	}
	bal := p.Balance
	if bal < 0 {
		bal = 0
	}
	return bal * int64(p.MaxPrizeBps) / 10000
}

// CasePromoCode — unlocks a promo-kind case when redeemed.
type CasePromoCode struct {
	Code      string     `gorm:"size:32;primaryKey" json:"code"`
	CaseID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"case_id"`
	MaxUses   int        `gorm:"not null;default:0" json:"max_uses"`
	UsedCount int        `gorm:"not null;default:0" json:"used_count"`
	Active    bool       `gorm:"not null;default:true" json:"active"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

func (CasePromoCode) TableName() string { return "case_promo_codes" }

// CasePromoRedemption — one successful open per user per case promo code.
type CasePromoRedemption struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID     uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_case_promo_user_code" json:"user_id"`
	Code       string    `gorm:"size:32;not null;uniqueIndex:idx_case_promo_user_code;index" json:"code"`
	CaseID     uuid.UUID `gorm:"type:uuid;not null;index" json:"case_id"`
	CaseOpenID uuid.UUID `gorm:"type:uuid;not null" json:"case_open_id"`
	CreatedAt  time.Time `json:"created_at"`
}

func (CasePromoRedemption) TableName() string { return "case_promo_redemptions" }

// CaseQuestShare tracks confirmed shares for case quest unlock.
type CaseQuestShare struct {
	UserID     uuid.UUID `gorm:"type:uuid;primaryKey" json:"user_id"`
	CaseID     uuid.UUID `gorm:"type:uuid;primaryKey;index" json:"case_id"`
	ShareCount int       `gorm:"not null;default:0" json:"share_count"`
	UpdatedAt  time.Time `json:"updated_at"`
}

func (CaseQuestShare) TableName() string { return "case_quest_shares" }

// CaseQuestSharePrepared maps a Telegram prepared inline result to a case quest share.
type CaseQuestSharePrepared struct {
	ID                 uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	ResultID           string     `gorm:"type:text;uniqueIndex;not null" json:"result_id"`
	UserID             uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	CaseID             uuid.UUID  `gorm:"type:uuid;not null;index" json:"case_id"`
	PreparedMessageID  string     `gorm:"type:text;not null;default:''" json:"prepared_message_id"`
	ConfirmedAt        *time.Time `json:"confirmed_at,omitempty"`
	CreatedAt          time.Time  `gorm:"not null" json:"created_at"`
}

func (CaseQuestSharePrepared) TableName() string { return "case_quest_share_prepared" }

// CaseLiveDrop — recent case open for the catalog live feed.
type CaseLiveDrop struct {
	OpenID              uuid.UUID `json:"open_id"`
	PrizeType           string    `json:"prize_type,omitempty"`
	CollectionSlug      string    `json:"collection_slug"`
	DisplayName         string    `json:"display_name"`
	ImageURL            string    `json:"image_url"`
	RarityLabel         string    `json:"rarity_label,omitempty"`
	TileBackgroundColor string    `json:"tile_background_color,omitempty"`
	Backdrop            string    `json:"backdrop,omitempty"`
	FloorPriceNanoton   int64     `json:"floor_price_nanoton"`
	CreatedAt           time.Time `json:"created_at"`
}

// CaseLiveFeedSettings — singleton (id=1) for fake live-feed knobs.
// Rarity tiers are derived from prize value intervals (nanoton), not loot.rarity_label:
//   common:    [0, CommonMax)
//   uncommon:  [CommonMax, UncommonMax)
//   rare:      [UncommonMax, RareMax)
//   epic:      [RareMax, EpicMax)
//   legendary: [EpicMax, +inf)
type CaseLiveFeedSettings struct {
	ID                 int       `gorm:"primaryKey" json:"id"`
	Enabled            bool      `gorm:"not null;default:false" json:"enabled"`
	Intensity          float64   `gorm:"type:decimal(6,3);not null;default:1" json:"intensity"`
	FillWhenSparse     bool      `gorm:"not null;default:true" json:"fill_when_sparse"`
	MinVisible         int       `gorm:"not null;default:6" json:"min_visible"`
	CommonWeight       float64   `gorm:"type:decimal(8,3);not null;default:50" json:"common_weight"`
	UncommonWeight     float64   `gorm:"type:decimal(8,3);not null;default:25" json:"uncommon_weight"`
	RareWeight         float64   `gorm:"type:decimal(8,3);not null;default:15" json:"rare_weight"`
	EpicWeight         float64   `gorm:"type:decimal(8,3);not null;default:7" json:"epic_weight"`
	LegendaryWeight    float64   `gorm:"type:decimal(8,3);not null;default:3" json:"legendary_weight"`
	CommonMaxNanoton   int64     `gorm:"not null;default:500000000" json:"common_max_nanoton"`
	UncommonMaxNanoton int64     `gorm:"not null;default:1500000000" json:"uncommon_max_nanoton"`
	RareMaxNanoton     int64     `gorm:"not null;default:3000000000" json:"rare_max_nanoton"`
	EpicMaxNanoton     int64     `gorm:"not null;default:5000000000" json:"epic_max_nanoton"`
	FatChance          float64   `gorm:"type:decimal(6,4);not null;default:0.08" json:"fat_chance"`
	FatMinFloorNanoton int64     `gorm:"not null;default:5000000000" json:"fat_min_floor_nanoton"`
	// MaxGiftFloorNanoton — hide gift drops above this floor (0 = no cap).
	MaxGiftFloorNanoton int64 `gorm:"not null;default:0" json:"max_gift_floor_nanoton"`
	// HideTon — when true, TON prizes are excluded from the live feed (gifts only).
	HideTon   bool      `gorm:"not null;default:false" json:"hide_ton"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (CaseLiveFeedSettings) TableName() string { return "case_live_feed_settings" }

// IsCaseClaimItem — inventory row from a case open or quest gift grant (guaranteed cashout / unbacked fulfill).
func IsCaseClaimItem(item InventoryItem) bool {
	if strings.HasPrefix(item.TelegramTxRef, CaseClaimTxRefPrefix) {
		return true
	}
	if strings.HasPrefix(item.TelegramTxRef, QuestClaimTxRefPrefix) {
		return true
	}
	return hasCaseClaimMetadata(item.Metadata)
}

func hasCaseClaimMetadata(meta datatypes.JSON) bool {
	if len(meta) == 0 {
		return false
	}
	var raw map[string]any
	if err := json.Unmarshal(meta, &raw); err != nil {
		return false
	}
	if _, ok := raw[CaseClaimMetaCaseID]; ok {
		return true
	}
	if _, ok := raw[CaseClaimMetaLootEntryID]; ok {
		return true
	}
	if _, ok := raw[QuestClaimMetaClaimID]; ok {
		return true
	}
	return false
}

// CaseClaimFulfillment reads metadata.fulfillment; empty means backed (real deposit / bound gift).
func CaseClaimFulfillment(meta datatypes.JSON) string {
	if len(meta) == 0 {
		return CaseFulfillmentBacked
	}
	raw := string(meta)
	if strings.Contains(raw, `"fulfillment":"unbacked"`) || strings.Contains(raw, `"fulfillment": "unbacked"`) {
		return CaseFulfillmentUnbacked
	}
	return CaseFulfillmentBacked
}

func IsUnbackedCaseClaim(item InventoryItem) bool {
	if !IsCaseClaimItem(item) {
		return false
	}
	if item.TelegramGiftID == "" {
		return true
	}
	return CaseClaimFulfillment(item.Metadata) == CaseFulfillmentUnbacked
}

func CaseClaimCashoutNanoton(meta datatypes.JSON) int64 {
	if len(meta) == 0 {
		return 0
	}
	var raw map[string]any
	if err := json.Unmarshal(meta, &raw); err != nil {
		return 0
	}
	switch value := raw[CaseClaimMetaCashoutNanoton].(type) {
	case float64:
		return int64(value)
	case int64:
		return value
	case int:
		return int64(value)
	default:
		return 0
	}
}

// NormalizeCasePrizeType returns gift|ton (empty → gift).
func NormalizeCasePrizeType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case CasePrizeTypeTon:
		return CasePrizeTypeTon
	default:
		return CasePrizeTypeGift
	}
}

// CaseLootPrizeValueNanoton is EV/display value: ton amount or gift floor.
func CaseLootPrizeValueNanoton(e CaseLootEntry) int64 {
	if NormalizeCasePrizeType(e.PrizeType) == CasePrizeTypeTon {
		if e.AmountNanoton > 0 {
			return e.AmountNanoton
		}
		return e.FloorPriceNanoton
	}
	return e.FloorPriceNanoton
}

// AllowedLootTileColors — preset palette in admin (any #rrggbb is also allowed).
var AllowedLootTileColors = []string{
	"#f77091", "#ff9ebb", "#ff6b8b", "#ffb7b2", "#ff8e72", "#fdffb6",
	"#cff4d2", "#a8f0d3", "#70d6ff", "#54bbf0", "#a0c4ff", "#bdb2ff",
	"#9d8df1", "#3d348b", "#1a2642", "#111a2e", "#151616", "#424748",
}

// NormalizeLootTileBackgroundColor returns a normalized #rrggbb hex or "".
// Empty string = use rarity default. Accepts any valid 6-digit hex (palette or custom).
func NormalizeLootTileBackgroundColor(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return ""
	}
	if len(s) == 7 && s[0] == '#' {
		for i := 1; i < 7; i++ {
			c := s[i]
			if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
				return ""
			}
		}
		return s
	}
	return ""
}

// NormalizeCaseLootBackdrop returns a price-sensitive black backdrop or "".
// Only Black / Onyx Black are allowed on case loot (premium trait).
func NormalizeCaseLootBackdrop(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "black":
		return "Black"
	case "onyx black":
		return "Onyx Black"
	default:
		return ""
	}
}
