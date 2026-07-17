package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// GameConfig — per-game economics and bet limits (admin-tunable).
type GameConfig struct {
	GameType         GameType  `gorm:"type:varchar(16);primaryKey" json:"game_type"`
	Enabled          bool      `gorm:"not null;default:true" json:"enabled"`
	MinBetNanoton    int64     `gorm:"not null" json:"min_bet_nanoton"`
	MaxBetNanoton    int64     `gorm:"not null" json:"max_bet_nanoton"`
	MaxPayoutNanoton int64     `gorm:"not null" json:"max_payout_nanoton"`
	HouseEdgeBps     int       `gorm:"not null" json:"house_edge_bps"`
	RTPBps           int       `gorm:"not null" json:"rtp_bps"`
	PlatformFeeBps   int       `gorm:"not null;default:0" json:"platform_fee_bps"`
	UpdatedAt        time.Time `json:"updated_at"`
}

func (GameConfig) TableName() string { return "game_configs" }

// PlatformRiskSettings — singleton row (id=1) for anti-whale and treasury limits.
type PlatformRiskSettings struct {
	ID                         int       `gorm:"primaryKey" json:"id"`
	MaxDailyWinNanoton         int64     `gorm:"not null" json:"max_daily_win_nanoton"`
	MaxRoundExposureNanoton    int64     `gorm:"not null" json:"max_round_exposure_nanoton"`
	WhaleBetThresholdNanoton   int64     `gorm:"not null" json:"whale_bet_threshold_nanoton"`
	AutoReviewWithdrawNanoton  int64     `gorm:"not null" json:"auto_review_withdraw_nanoton"`
	HotWalletMaxBalanceNanoton int64     `gorm:"not null" json:"hot_wallet_max_balance_nanoton"`
	HotWalletSweepThreshold    int64     `gorm:"not null" json:"hot_wallet_sweep_threshold_nanoton"`
	ColdWalletAddress          string    `gorm:"size:128" json:"cold_wallet_address"`
	UpdatedAt                  time.Time `json:"updated_at"`
}

func (PlatformRiskSettings) TableName() string { return "platform_risk_settings" }

// ProvablyFairSeedSession — active/revealed server seed chain per game.
type ProvablyFairSeedSession struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GameType       GameType  `gorm:"type:varchar(16);not null;index" json:"game_type"`
	ServerSeedHash string    `gorm:"size:64;not null" json:"server_seed_hash"`
	ServerSeed     string    `gorm:"size:128" json:"server_seed,omitempty"`
	ClientSeed     string    `gorm:"size:128" json:"client_seed"`
	Nonce          int64     `gorm:"not null;default:0" json:"nonce"`
	Active         bool      `gorm:"not null;default:true;index" json:"active"`
	RotatedAt      *time.Time `json:"rotated_at,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

func (ProvablyFairSeedSession) TableName() string { return "provably_fair_seed_sessions" }

// AdminAuditLog — immutable record of admin actions.
type AdminAuditLog struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AdminUserID uuid.UUID      `gorm:"type:uuid;not null;index" json:"admin_user_id"`
	Action      string         `gorm:"size:64;not null;index" json:"action"`
	TargetType  string         `gorm:"size:32" json:"target_type"`
	TargetID    string         `gorm:"size:128" json:"target_id"`
	Meta        datatypes.JSON `gorm:"type:jsonb" json:"meta,omitempty"`
	CreatedAt   time.Time      `gorm:"index" json:"created_at"`
}

func (AdminAuditLog) TableName() string { return "admin_audit_logs" }

// PromoCode — marketing bonus codes with wager requirement.
type PromoCode struct {
	Code              string     `gorm:"size:32;primaryKey" json:"code"`
	BonusNanoton      int64      `gorm:"not null" json:"bonus_nanoton"`
	WagerMultiplier   float64    `gorm:"type:decimal(6,2);not null;default:1" json:"wager_multiplier"`
	MaxUses           int        `gorm:"not null;default:0" json:"max_uses"`
	UsedCount         int        `gorm:"not null;default:0" json:"used_count"`
	Active            bool       `gorm:"not null;default:true" json:"active"`
	ExpiresAt         *time.Time `json:"expires_at,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
}

func (PromoCode) TableName() string { return "promo_codes" }

// TelegramBotSettings — singleton for bot broadcast and spam protection.
type TelegramBotSettings struct {
	ID                  int       `gorm:"primaryKey" json:"id"`
	BroadcastEnabled    bool      `gorm:"not null;default:false" json:"broadcast_enabled"`
	SpamProtectionLevel int       `gorm:"not null;default:1" json:"spam_protection_level"`
	WebAppURL           string    `gorm:"column:web_app_url;size:512" json:"webapp_url"`
	WebAppButtonText    string    `gorm:"column:web_app_button_text;size:64" json:"webapp_button_text"`
	UpdatedAt           time.Time `json:"updated_at"`
}

func (TelegramBotSettings) TableName() string { return "telegram_bot_settings" }

// PlatformYieldSettings - singleton row (id=1) for staking, referral and gift price adjustments.
type PlatformYieldSettings struct {
	ID                              int       `gorm:"primaryKey" json:"id"`
	ReferralSharePercent            float64   `gorm:"type:decimal(6,2);not null;default:5" json:"referral_share_percent"`
	ReferralGGRSharePercent         float64   `gorm:"type:decimal(6,2);not null;default:5" json:"referral_ggr_share_percent"`
	ReferralMilestoneNanoton        int64     `gorm:"not null;default:50000000" json:"referral_milestone_nanoton"`
	ReferralMilestoneMonthlyCap     int       `gorm:"not null;default:20" json:"referral_milestone_monthly_cap"`
	ReferralMonthlyPayoutCapNanoton int64     `gorm:"not null;default:0" json:"referral_monthly_payout_cap_nanoton"`
	StakingBaseMonthlyPercent       float64   `gorm:"type:decimal(6,2);not null;default:3" json:"staking_base_monthly_percent"`
	StakingBoostMonthlyPercent      float64   `gorm:"type:decimal(6,2);not null;default:4" json:"staking_boost_monthly_percent"`
	StakingTVLCapNanoton            int64     `gorm:"not null;default:1500000000000" json:"staking_tvl_cap_nanoton"`
	GiftBuyAdjustPercent            float64   `gorm:"type:decimal(8,2);not null;default:0" json:"gift_buy_adjust_percent"`
	GiftValuationAdjustPercent      float64   `gorm:"type:decimal(8,2);not null;default:0" json:"gift_valuation_adjust_percent"`
	UpdatedAt                       time.Time `json:"updated_at"`
}

func (PlatformYieldSettings) TableName() string { return "platform_yield_settings" }

// RevenueSummary — aggregated financial metrics for admin dashboard.
type RevenueSummary struct {
	NetRevenueNanoton        int64 `json:"net_revenue_nanoton"`
	DepositsNanoton          int64 `json:"deposits_nanoton"`
	WithdrawalsNanoton       int64 `json:"withdrawals_nanoton"`
	PendingLiabilityNanoton  int64 `json:"pending_liability_nanoton"`
	WithdrawalFeesNanoton    int64 `json:"withdrawal_fees_nanoton"`
	MarketFeesNanoton        int64 `json:"market_fees_nanoton"`
	PvPFeesNanoton           int64 `json:"pvp_fees_nanoton"`
	GameBetsNanoton          int64 `json:"game_bets_nanoton"`
	GameWinsNanoton          int64 `json:"game_wins_nanoton"`
	ReferralExpenseNanoton   int64 `json:"referral_expense_nanoton"`
	StakingExpenseNanoton    int64 `json:"staking_expense_nanoton"`
	HotWalletExposureNanoton int64 `json:"hot_wallet_exposure_nanoton"`
	ActiveUsers24h           int64 `json:"active_users_24h"`
	GGRNanoton               int64 `json:"ggr_nanoton"`
	NGRNanoton               int64 `json:"ngr_nanoton"`
}

// RevenueTimeseriesPoint — daily revenue breakdown.
type RevenueTimeseriesPoint struct {
	Period           string `json:"period"`
	RevenueNanoton   int64  `json:"revenue_nanoton"`
	DepositsNanoton  int64  `json:"deposits_nanoton"`
	GameBetsNanoton  int64  `json:"game_bets_nanoton"`
}

// AdminGameStat — per-game GGR and volume.
type AdminGameStat struct {
	GameType          GameType `json:"game_type"`
	Rounds            int64    `json:"rounds"`
	BetVolumeNanoton  int64    `json:"bet_volume_nanoton"`
	PayoutNanoton     int64    `json:"payout_nanoton"`
	GGRNanoton        int64    `json:"ggr_nanoton"`
	TheoreticalRTPBps int      `json:"theoretical_rtp_bps"`
	ActualRTPBps      int      `json:"actual_rtp_bps"`
}

// AdminRiskUser — user flagged for risk monitoring.
type AdminRiskUser struct {
	UserID                  uuid.UUID `json:"user_id"`
	Username                string    `json:"username"`
	FirstName               string    `json:"first_name"`
	WithdrawalVolumeNanoton int64     `json:"withdrawal_volume_nanoton"`
	DailyWinNanoton         int64     `json:"daily_win_nanoton"`
	RiskFlags               []string  `json:"risk_flags"`
}

// AdminUserRow — admin users list row with live staking principal and yield obligations.
type AdminUserRow struct {
	User
	StakingPrincipalNanoton    int64  `json:"staking_principal_nanoton"`
	ActiveStakes               int64  `json:"active_stakes"`
	StakingAccruedYieldNanoton int64  `json:"staking_accrued_yield_nanoton"`
	StakingDailyYieldNanoton   int64  `json:"staking_daily_yield_nanoton"`
	StakingWeeklyYieldNanoton  int64  `json:"staking_weekly_yield_nanoton"`
	BetsCount                  int64  `json:"bets_count"`
	CameViaReferral            bool   `json:"came_via_referral"`
	ReferrerTelegramID         int64  `json:"referrer_telegram_id,omitempty"`
	ReferrerUsername           string `json:"referrer_username,omitempty"`
	ReferrerFirstName          string `json:"referrer_first_name,omitempty"`
	ReferrerCode               string `json:"referrer_code,omitempty"`
}

// AdminUserBetItem — readable bet row for the admin user card.
type AdminUserBetItem struct {
	ID              uuid.UUID `json:"id"`
	GameType        GameType  `json:"game_type"`
	Status          BetStatus `json:"status"`
	AmountNanoton   int64     `json:"amount_nanoton"`
	PayoutNanoton   int64     `json:"payout_nanoton"`
	FundingType     string    `json:"funding_type"`
	SelectionLabel  string    `json:"selection_label"`
	CashoutMult     *float64  `json:"cashout_multiplier,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// AdminUserBetsSummary — aggregates for a period (not limited to returned items).
type AdminUserBetsSummary struct {
	Bets           int64 `json:"bets"`
	Won            int64 `json:"won"`
	Lost           int64 `json:"lost"`
	VolumeNanoton  int64 `json:"volume_nanoton"`
	PayoutNanoton  int64 `json:"payout_nanoton"`
	NetNanoton     int64 `json:"net_nanoton"`
}

// AdminUserBetsResponse — period-filtered bets for one user.
type AdminUserBetsResponse struct {
	Period  string              `json:"period"`
	Summary AdminUserBetsSummary `json:"summary"`
	Items   []AdminUserBetItem  `json:"items"`
}

// AdminUserTransfersSummary — deposit/withdraw aggregates for a period.
type AdminUserTransfersSummary struct {
	Deposits               int64 `json:"deposits"`
	Withdrawals            int64 `json:"withdrawals"`
	DepositVolumeNanoton   int64 `json:"deposit_volume_nanoton"`
	WithdrawalVolumeNanoton int64 `json:"withdrawal_volume_nanoton"`
	Failed                 int64 `json:"failed"`
}

// AdminUserTransfersResponse — period-filtered wallet transfers for one user.
type AdminUserTransfersResponse struct {
	Period  string                    `json:"period"`
	Summary AdminUserTransfersSummary `json:"summary"`
	Items   []TonTransfer             `json:"items"`
}

// AdminReferrerStat — top invite sources for the admin users page.
type AdminReferrerStat struct {
	UserID            uuid.UUID `json:"user_id"`
	TelegramID        int64     `json:"telegram_id"`
	Username          string    `json:"username"`
	FirstName         string    `json:"first_name"`
	ReferralCode      string    `json:"referral_code"`
	ReferralCount     int64     `json:"referral_count"`
	ReferralCountToday int64    `json:"referral_count_today"`
	ReferralCount7d   int64     `json:"referral_count_7d"`
}

// AdminUserAudience — bot audience breakdown for the admin users page.
type AdminUserAudience struct {
	TotalUsers                 int64               `json:"total_users"`
	BannedUsers                int64               `json:"banned_users"`
	ActiveUsers24h             int64               `json:"active_users_24h"`
	ActiveUsers7d              int64               `json:"active_users_7d"`
	NewUsersToday              int64               `json:"new_users_today"`
	NewUsers24h                int64               `json:"new_users_24h"`
	NewUsers7d                 int64               `json:"new_users_7d"`
	ReferredUsers              int64               `json:"referred_users"`
	OrganicUsers               int64               `json:"organic_users"`
	ReferredToday              int64               `json:"referred_today"`
	Referred7d                 int64               `json:"referred_7d"`
	WithBalance                int64               `json:"with_balance"`
	WithWallet                 int64               `json:"with_wallet"`
	WithStaking                int64               `json:"with_staking"`
	BoostTierUsers             int64               `json:"boost_tier_users"`
	StakingTVLNanoton          int64               `json:"staking_tvl_nanoton"`
	BalancesNanoton            int64               `json:"balances_nanoton"`
	PromoBalancesNanoton       int64               `json:"promo_balances_nanoton"`
	StakingAccruedYieldNanoton int64               `json:"staking_accrued_yield_nanoton"`
	StakingDailyYieldNanoton   int64               `json:"staking_daily_yield_nanoton"`
	StakingWeeklyYieldNanoton  int64               `json:"staking_weekly_yield_nanoton"`
	TopReferrers               []AdminReferrerStat `json:"top_referrers"`
}

// PromoRedemption — player promo activation with wager tracking.
type PromoRedemption struct {
	ID                   uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID               uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	PromoCode            string     `gorm:"size:32;not null;index" json:"promo_code"`
	BonusNanoton         int64      `gorm:"not null" json:"bonus_nanoton"`
	WagerRequiredNanoton int64      `gorm:"not null" json:"wager_required_nanoton"`
	WagerProgressNanoton int64      `gorm:"not null;default:0" json:"wager_progress_nanoton"`
	MaxCashoutNanoton    int64      `gorm:"not null;default:0" json:"max_cashout_nanoton"`
	Status               string     `gorm:"size:32;not null;default:'active';index" json:"status"`
	CreatedAt            time.Time  `json:"created_at"`
	CompletedAt          *time.Time `json:"completed_at,omitempty"`
}

func (PromoRedemption) TableName() string { return "promo_redemptions" }

// TelegramBroadcast — queued mass message to all players.
type TelegramBroadcast struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Message     string     `gorm:"type:text;not null" json:"message"`
	Status      string     `gorm:"size:32;not null;default:'queued';index" json:"status"`
	TotalUsers  int        `gorm:"not null;default:0" json:"total_users"`
	SentCount   int        `gorm:"not null;default:0" json:"sent_count"`
	FailedCount int        `gorm:"not null;default:0" json:"failed_count"`
	CreatedBy   uuid.UUID  `gorm:"type:uuid;not null" json:"created_by"`
	CreatedAt   time.Time  `json:"created_at"`
	FinishedAt  *time.Time `json:"finished_at,omitempty"`
}

func (TelegramBroadcast) TableName() string { return "telegram_broadcasts" }

// TreasurySweep — on-chain hot → cold transfer record.
type TreasurySweep struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AmountNanoton     int64     `gorm:"not null" json:"amount_nanoton"`
	ColdWalletAddress string    `gorm:"size:128;not null" json:"cold_wallet_address"`
	HotBalanceBefore  int64     `gorm:"not null;default:0" json:"hot_balance_before"`
	TxHash            *string   `gorm:"size:128" json:"tx_hash,omitempty"`
	Status            string    `gorm:"size:32;not null;default:'completed'" json:"status"`
	ErrorMessage      *string   `gorm:"type:text" json:"error_message,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
}

func (TreasurySweep) TableName() string { return "treasury_sweeps" }

// RoundProof — provably fair verification payload for a finished round.
type RoundProof struct {
	RoundID        uuid.UUID `json:"round_id"`
	GameType       GameType  `json:"game_type"`
	RoundNumber    int64     `json:"round_number"`
	ServerSeedHash string    `json:"server_seed_hash"`
	ServerSeed     string    `json:"server_seed,omitempty"`
	ClientSeed     string    `json:"client_seed,omitempty"`
	Nonce          int64     `json:"nonce"`
	Result         string    `json:"result,omitempty"`
	AdminInfluenced bool     `json:"admin_influenced"`
	Verified       bool      `json:"verified"`
}
