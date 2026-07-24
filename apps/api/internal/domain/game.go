package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type GameType string

const (
	GameRoulette GameType = "roulette"
	GameCrash    GameType = "crash"
	GamePvP      GameType = "pvp"
	GameWheel    GameType = "wheel"
)

// AllGameModes is the ordered list of user-facing game modes.
var AllGameModes = []GameType{GameWheel, GameCrash, GameRoulette, GamePvP}

type GameRound struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GameType       GameType       `gorm:"type:varchar(16);not null;index" json:"game_type"`
	RoundNumber    int64          `gorm:"not null;index" json:"round_number"`
	Status         string         `gorm:"type:varchar(32);not null" json:"status"`
	StartedAt      time.Time      `json:"started_at"`
	EndedAt        *time.Time     `json:"ended_at,omitempty"`
	ResultPayload  datatypes.JSON `gorm:"type:jsonb" json:"result_payload,omitempty"`
	ServerSeedHash string         `gorm:"size:64" json:"server_seed_hash"`
	ServerSeed     string         `gorm:"size:128" json:"server_seed,omitempty"`
	ClientSeed     string         `gorm:"size:128" json:"client_seed"`
	Nonce          int64          `gorm:"default:0" json:"nonce"`
	AdminInfluenced bool          `gorm:"not null;default:false" json:"admin_influenced"`
	CreatedAt      time.Time      `json:"created_at"`

	Bets []GameBet `gorm:"foreignKey:RoundID" json:"-"`
}

// GameOutcomeOverride — admin-scheduled future game outcome. The engine searches
// for a server seed that naturally produces the target outcome, preserving
// provably-fair verifiability (VerifyRound still returns true).
type GameOutcomeOverride struct {
	ID              uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GameType        GameType       `gorm:"type:varchar(16);not null;index" json:"game_type"`
	Target          datatypes.JSON `gorm:"type:jsonb" json:"target"`
	RoundsRemaining int            `gorm:"not null" json:"rounds_remaining"`
	CreatedBy       uuid.UUID      `gorm:"type:uuid" json:"created_by"`
	Note            string         `gorm:"size:256" json:"note"`
	ExpiresAt       *time.Time     `json:"expires_at,omitempty"`
	CreatedAt       time.Time      `json:"created_at"`
}

func (GameOutcomeOverride) TableName() string { return "game_outcome_overrides" }

type BetStatus string

const (
	BetPending   BetStatus = "pending"
	BetWon       BetStatus = "won"
	BetLost      BetStatus = "lost"
	BetCashedOut BetStatus = "cashed_out"
	BetRefunded  BetStatus = "refunded"
)

type BetFundingType string

const (
	BetFundingBalance  BetFundingType = "balance"
	BetFundingGift     BetFundingType = "gift"
	BetFundingCombined BetFundingType = "combined"
)

type GameBet struct {
	ID                uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	RoundID           uuid.UUID      `gorm:"type:uuid;not null;index" json:"round_id"`
	UserID            uuid.UUID      `gorm:"type:uuid;not null;index" json:"user_id"`
	GameType          GameType       `gorm:"type:varchar(16);not null;index" json:"game_type"`
	AmountNanoton     int64          `gorm:"not null" json:"amount_nanoton"`
	FundingType       BetFundingType `gorm:"type:varchar(16);not null;default:balance" json:"funding_type"`
	InventoryItemID   *uuid.UUID     `gorm:"type:uuid" json:"inventory_item_id,omitempty"`
	Selection         datatypes.JSON `gorm:"type:jsonb" json:"selection"`
	PayoutNanoton     int64          `gorm:"default:0" json:"payout_nanoton"`
	PlatformFee       int64          `gorm:"default:0" json:"platform_fee"`
	Status            BetStatus      `gorm:"type:varchar(32);not null;index" json:"status"`
	CashoutMultiplier *float64       `gorm:"type:decimal(10,4)" json:"cashout_multiplier,omitempty"`
	IdempotencyKey    string         `gorm:"size:64;uniqueIndex" json:"-"`
	CreatedAt         time.Time      `json:"created_at"`
	SettledAt         *time.Time     `json:"settled_at,omitempty"`

	Round GameRound `gorm:"foreignKey:RoundID" json:"-"`
	User  User      `gorm:"foreignKey:UserID" json:"-"`
}

type PvPRoom struct {
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CreatorID        uuid.UUID  `gorm:"type:uuid;not null;index" json:"creator_id"`
	BetAmountNanoton int64      `gorm:"not null" json:"bet_amount_nanoton"`
	MaxPlayers       int        `gorm:"not null;default:2" json:"max_players"`
	Status           string     `gorm:"type:varchar(32);not null;index" json:"status"`
	WinnerID         *uuid.UUID `gorm:"type:uuid" json:"winner_id,omitempty"`
	PlatformFeeBps   int        `gorm:"not null;default:500" json:"platform_fee_bps"`
	GameRoundID      *uuid.UUID `gorm:"type:uuid" json:"game_round_id,omitempty"`
	SpinAt           *time.Time `json:"spin_at,omitempty"`
	SpinEndsAt       *time.Time `json:"spin_ends_at,omitempty"`
	PayoutNanoton    *int64     `json:"payout_nanoton,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	FinishedAt       *time.Time `json:"finished_at,omitempty"`
}

type PvPRoomPlayer struct {
	RoomID          uuid.UUID      `gorm:"type:uuid;primaryKey" json:"room_id"`
	UserID          uuid.UUID      `gorm:"type:uuid;primaryKey" json:"user_id"`
	StakeNanoton    int64          `gorm:"not null" json:"stake_nanoton"`
	BalanceNanoton  int64          `gorm:"not null;default:0" json:"balance_nanoton"`
	FundingType     BetFundingType `gorm:"type:varchar(16);not null;default:balance" json:"funding_type"`
	InventoryItemID *uuid.UUID     `gorm:"type:uuid" json:"inventory_item_id,omitempty"`
	JoinedAt        time.Time      `json:"joined_at"`
	IsWinner        bool           `gorm:"default:false" json:"is_winner"`
}

// PvPRoomPlayerGift stores each gift locked into a player's PvP stake.
type PvPRoomPlayerGift struct {
	RoomID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"room_id"`
	UserID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"user_id"`
	InventoryItemID uuid.UUID `gorm:"type:uuid;primaryKey" json:"inventory_item_id"`
	ValueNanoton    int64     `gorm:"not null;default:0" json:"value_nanoton"`
}

type LedgerType string

const (
	LedgerDeposit    LedgerType = "deposit"
	LedgerLiquidate  LedgerType = "liquidate"
	LedgerBet        LedgerType = "bet"
	LedgerWin        LedgerType = "win"
	LedgerStakeYield    LedgerType = "stake_yield"
	LedgerReferralBonus LedgerType = "referral_bonus"
	LedgerPromoBonus    LedgerType = "promo_bonus"
	LedgerWheelPrize    LedgerType = "wheel_prize"
	LedgerCaseOpen      LedgerType = "case_open"
	LedgerCasePrize     LedgerType = "case_prize"
	LedgerWithdraw   LedgerType = "withdraw"
	LedgerRefund     LedgerType = "refund"
	LedgerMarketBuy  LedgerType = "market_buy"
	LedgerMarketSell LedgerType = "market_sell"
	LedgerAdminAdjust LedgerType = "admin_adjust"
)

type BalanceLedger struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID        uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	Type          LedgerType `gorm:"type:varchar(32);not null" json:"type"`
	AmountNanoton int64      `gorm:"not null" json:"amount_nanoton"`
	BalanceAfter  int64      `gorm:"not null" json:"balance_after"`
	ReferenceType string     `gorm:"size:32" json:"reference_type"`
	ReferenceID   uuid.UUID  `gorm:"type:uuid" json:"reference_id"`
	CreatedAt     time.Time  `gorm:"index" json:"created_at"`
}
