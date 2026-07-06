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
	SetReferrerIfEmpty(ctx context.Context, userID, referrerID uuid.UUID) error
	CountReferrals(ctx context.Context, referrerID uuid.UUID) (int64, error)
	SumReferralEarnings(ctx context.Context, userID uuid.UUID) (int64, error)
}

type InventoryRepository interface {
	ListByUser(ctx context.Context, userID uuid.UUID, status *InventoryStatus) ([]InventoryItem, error)
	FindByID(ctx context.Context, id uuid.UUID) (*InventoryItem, error)
	FindByTelegramGiftID(ctx context.Context, userID uuid.UUID, giftID string) (*InventoryItem, error)
	FindByGiftSlug(ctx context.Context, slug string) (*InventoryItem, error)
	Create(ctx context.Context, item *InventoryItem) error
	UpdateStatus(ctx context.Context, id uuid.UUID, from, to InventoryStatus) error
	TransferOwnership(ctx context.Context, itemID, newUserID uuid.UUID, fromStatus InventoryStatus) error
	GetFloorPrice(ctx context.Context, collectionSlug string) (int64, error)
	SetFloorPrice(ctx context.Context, slug string, price int64) error
}

type MarketRepository interface {
	ListActive(ctx context.Context, limit, offset int) ([]MarketListing, error)
	FindByID(ctx context.Context, id uuid.UUID) (*MarketListing, error)
	ListBySeller(ctx context.Context, sellerID uuid.UUID) ([]MarketListing, error)
	FindActiveByItemID(ctx context.Context, itemID uuid.UUID) (*MarketListing, error)
	CreateListing(ctx context.Context, listing *MarketListing) error
	CancelListing(ctx context.Context, id, sellerID uuid.UUID) error
	Purchase(ctx context.Context, listingID, buyerID uuid.UUID, price, sellerProceeds int64, fee int) (*MarketListing, error)
	SellToBot(ctx context.Context, sellerID, itemID uuid.UUID, payout, listPrice int64) (int64, error)
	EnsureBotUser(ctx context.Context) (*User, error)
	CountActive(ctx context.Context) (int64, error)
}

type StakingRepository interface {
	CreatePosition(ctx context.Context, pos *StakingPosition) error
	ListActiveByUser(ctx context.Context, userID uuid.UUID) ([]StakingPosition, error)
	ListActiveByUserEpoch(ctx context.Context, userID, epochID uuid.UUID) ([]StakingPosition, error)
	ListAllActive(ctx context.Context) ([]StakingPosition, error)
	ListAllActiveEpoch(ctx context.Context, epochID uuid.UUID) ([]StakingPosition, error)
	Deactivate(ctx context.Context, positionID uuid.UUID) error
	DeactivateWithReason(ctx context.Context, positionID uuid.UUID, reason StakingRevokeReason) error
	UpdateAccrual(ctx context.Context, positionID uuid.UUID, yieldDelta int64) error
	GetSnapshot(ctx context.Context, userID uuid.UUID) (*UserStakingSnapshot, error)
	UpsertSnapshot(ctx context.Context, snap *UserStakingSnapshot) error
	SumRouletteWagerLast7Days(ctx context.Context, userID uuid.UUID) (int64, error)

	GetActiveEpoch(ctx context.Context, now time.Time) (*StakingEpoch, error)
	GetEpochDueForSettlement(ctx context.Context, now time.Time) (*StakingEpoch, error)
	CreateEpoch(ctx context.Context, epoch *StakingEpoch) error
	SettleEpoch(ctx context.Context, epochID uuid.UUID) error
	GetGiftClaim(ctx context.Context, giftSlug string) (*StakingGiftClaim, error)
	UpsertGiftClaim(ctx context.Context, claim *StakingGiftClaim) error
	DeleteGiftClaim(ctx context.Context, giftSlug string) error
	DeleteGiftClaimsByEpoch(ctx context.Context, epochID uuid.UUID) error
	FindActivePositionBySlug(ctx context.Context, giftSlug string) (*StakingPosition, error)
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
	FindPendingBetByUserAndRound(ctx context.Context, userID, roundID uuid.UUID) (*GameBet, error)
	ListRecentFinishedRounds(ctx context.Context, gameType GameType, limit int) ([]GameRound, error)
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

type TonTransferRepository interface {
	FindByID(ctx context.Context, id uuid.UUID) (*TonTransfer, error)
	FindByIDForUser(ctx context.Context, id, userID uuid.UUID) (*TonTransfer, error)
	FindByIdempotencyKey(ctx context.Context, key string) (*TonTransfer, error)
	FindByDepositComment(ctx context.Context, comment string) (*TonTransfer, error)
	FindByTxHash(ctx context.Context, txHash string) (*TonTransfer, error)
	ListByUser(ctx context.Context, userID uuid.UUID, limit int) ([]TonTransfer, error)
	ListByStatus(ctx context.Context, statuses []TonTransferStatus, limit int) ([]TonTransfer, error)
	HasActiveWithdrawal(ctx context.Context, userID uuid.UUID) (bool, error)
	Create(ctx context.Context, transfer *TonTransfer) error
	Update(ctx context.Context, transfer *TonTransfer) error
	CreateWithdrawalAtomic(
		ctx context.Context,
		userID uuid.UUID,
		amountNanoton, feeNanoton int64,
		walletAddress, idempotencyKey string,
	) (*TonTransfer, int64, error)
	CompleteDepositAtomic(ctx context.Context, transferID uuid.UUID, txHash string, txLT int64) (int64, error)
	FailWithdrawalAtomic(ctx context.Context, transferID uuid.UUID, errMsg string) (int64, error)
	CompleteWithdrawal(ctx context.Context, transferID uuid.UUID, txHash string, txLT int64) error
}
