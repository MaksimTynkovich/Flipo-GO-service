package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type UserRepository interface {
	FindByID(ctx context.Context, id uuid.UUID) (*User, error)
	FindByTelegramID(ctx context.Context, telegramID int64) (*User, error)
	Upsert(ctx context.Context, user *User) error
	UpdateWallet(ctx context.Context, userID uuid.UUID, wallet string) error
	UpdateBalance(ctx context.Context, userID uuid.UUID, delta int64, ledger LedgerType, refType string, refID uuid.UUID) (int64, error)
	GetBalanceForUpdate(ctx context.Context, userID uuid.UUID) (int64, error)
	UpdateStakingTier(ctx context.Context, userID uuid.UUID, tier StakingTier) error
}

type InventoryRepository interface {
	ListByUser(ctx context.Context, userID uuid.UUID, status *InventoryStatus) ([]InventoryItem, error)
	FindByID(ctx context.Context, id uuid.UUID) (*InventoryItem, error)
	Create(ctx context.Context, item *InventoryItem) error
	UpdateStatus(ctx context.Context, id uuid.UUID, from, to InventoryStatus) error
	GetFloorPrice(ctx context.Context, collectionSlug string) (int64, error)
	SetFloorPrice(ctx context.Context, slug string, price int64) error
}

type StakingRepository interface {
	CreatePosition(ctx context.Context, pos *StakingPosition) error
	ListActiveByUser(ctx context.Context, userID uuid.UUID) ([]StakingPosition, error)
	ListAllActive(ctx context.Context) ([]StakingPosition, error)
	Deactivate(ctx context.Context, positionID uuid.UUID) error
	UpdateAccrual(ctx context.Context, positionID uuid.UUID, yieldDelta int64) error
	GetSnapshot(ctx context.Context, userID uuid.UUID) (*UserStakingSnapshot, error)
	UpsertSnapshot(ctx context.Context, snap *UserStakingSnapshot) error
	SumRouletteWagerLast7Days(ctx context.Context, userID uuid.UUID) (int64, error)
}

type GameRepository interface {
	CreateRound(ctx context.Context, round *GameRound) error
	UpdateRound(ctx context.Context, round *GameRound) error
	GetCurrentRound(ctx context.Context, gameType GameType) (*GameRound, error)
	GetRoundByID(ctx context.Context, id uuid.UUID) (*GameRound, error)
	GetNextRoundNumber(ctx context.Context, gameType GameType) (int64, error)
	CreateBet(ctx context.Context, bet *GameBet) error
	ListBetsByRound(ctx context.Context, roundID uuid.UUID) ([]GameBet, error)
	SettleBet(ctx context.Context, betID uuid.UUID, status BetStatus, payout int64, multiplier *float64) (bool, error)
	FindBetByIdempotency(ctx context.Context, key string) (*GameBet, error)
	ListPendingBetsByRound(ctx context.Context, roundID uuid.UUID) ([]GameBet, error)
}

type PvPRepository interface {
	CreateRoom(ctx context.Context, room *PvPRoom) error
	GetRoom(ctx context.Context, id uuid.UUID) (*PvPRoom, error)
	UpdateRoom(ctx context.Context, room *PvPRoom) error
	ListOpenRooms(ctx context.Context) ([]PvPRoom, error)
	AddPlayer(ctx context.Context, player *PvPRoomPlayer) error
	ListPlayers(ctx context.Context, roomID uuid.UUID) ([]PvPRoomPlayer, error)
	CountPlayers(ctx context.Context, roomID uuid.UUID) (int, error)
}

type GameStateCache interface {
	Set(ctx context.Context, key string, value []byte, ttl time.Duration) error
	Get(ctx context.Context, key string) ([]byte, error)
	Publish(ctx context.Context, channel string, message []byte) error
	Subscribe(ctx context.Context, channel string) (<-chan []byte, func(), error)
	AcquireLock(ctx context.Context, key string, ttl time.Duration) (bool, error)
	ReleaseLock(ctx context.Context, key string) error
}
