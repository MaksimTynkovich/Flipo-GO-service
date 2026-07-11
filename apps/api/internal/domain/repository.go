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
	ReleasePromoBalance(ctx context.Context, userID uuid.UUID) error
	GetBalanceForUpdate(ctx context.Context, userID uuid.UUID) (int64, error)
	UpdateStakingTier(ctx context.Context, userID uuid.UUID, tier StakingTier) error
	SetReferrerIfEmpty(ctx context.Context, userID, referrerID uuid.UUID) error
	CountReferrals(ctx context.Context, referrerID uuid.UUID) (int64, error)
	SumReferralEarnings(ctx context.Context, userID uuid.UUID) (int64, error)
	ListTelegramIDs(ctx context.Context, limit, offset int) ([]int64, error)
	CountUsers(ctx context.Context) (int64, error)
}

type InventoryRepository interface {
	ListByUser(ctx context.Context, userID uuid.UUID, status *InventoryStatus) ([]InventoryItem, error)
	FindByID(ctx context.Context, id uuid.UUID) (*InventoryItem, error)
	FindByTelegramGiftID(ctx context.Context, userID uuid.UUID, giftID string) (*InventoryItem, error)
	FindByGiftSlug(ctx context.Context, slug string) (*InventoryItem, error)
	FindActiveByGiftSlug(ctx context.Context, slug string) (*InventoryItem, error)
	FindByTelegramTxRef(ctx context.Context, txRef string) (*InventoryItem, error)
	Create(ctx context.Context, item *InventoryItem) error
	UpdateStatus(ctx context.Context, id uuid.UUID, from, to InventoryStatus) error
	LockForBet(ctx context.Context, userID, itemID uuid.UUID) error
	ReleaseFromBet(ctx context.Context, itemID uuid.UUID) error
	TransferFromBet(ctx context.Context, itemID, newUserID uuid.UUID) error
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
	UpdateListingPrice(ctx context.Context, listingID uuid.UUID, priceNanoton int64) error
	Purchase(ctx context.Context, listingID, buyerID uuid.UUID, price, sellerProceeds int64, fee int) (*MarketListing, error)
	SellToBot(ctx context.Context, sellerID, itemID uuid.UUID, payout, listPrice int64) (int64, error)
	AcquireGiftFromBet(ctx context.Context, itemID uuid.UUID) error
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
	ListPendingBetsByRoundWithUser(ctx context.Context, roundID uuid.UUID) ([]GameBet, error)
	ListBetsByRoundWithUser(ctx context.Context, roundID uuid.UUID) ([]GameBet, error)
	FindPendingBetByUserAndRound(ctx context.Context, userID, roundID uuid.UUID) (*GameBet, error)
	ListPendingBetsByUserAndRound(ctx context.Context, userID, roundID uuid.UUID) ([]GameBet, error)
	ListRecentFinishedRounds(ctx context.Context, gameType GameType, limit int) ([]GameRound, error)
	SumUserWinsSince(ctx context.Context, userID uuid.UUID, since time.Time) (int64, error)
	SumUserBetsSince(ctx context.Context, userID uuid.UUID, since time.Time) (int64, error)
	SumRoundBets(ctx context.Context, roundID uuid.UUID) (int64, error)
	GameStats(ctx context.Context) ([]AdminGameStat, error)
}

type PlatformRepository interface {
	GetGameConfig(ctx context.Context, gameType GameType) (*GameConfig, error)
	ListGameConfigs(ctx context.Context) ([]GameConfig, error)
	UpsertGameConfig(ctx context.Context, cfg *GameConfig) error
	GetRiskSettings(ctx context.Context) (*PlatformRiskSettings, error)
	UpdateRiskSettings(ctx context.Context, settings *PlatformRiskSettings) error
	GetActiveSeed(ctx context.Context, gameType GameType) (*ProvablyFairSeedSession, error)
	CreateSeedSession(ctx context.Context, session *ProvablyFairSeedSession) error
	DeactivateSeeds(ctx context.Context, gameType GameType) error
	ListSeedHistory(ctx context.Context, gameType GameType, limit int) ([]ProvablyFairSeedSession, error)
	ListPromoCodes(ctx context.Context) ([]PromoCode, error)
	UpsertPromoCode(ctx context.Context, promo *PromoCode) error
	DeletePromoCode(ctx context.Context, code string) error
	GetBotSettings(ctx context.Context) (*TelegramBotSettings, error)
	UpdateBotSettings(ctx context.Context, settings *TelegramBotSettings) error
	GetYieldSettings(ctx context.Context) (*PlatformYieldSettings, error)
	UpdateYieldSettings(ctx context.Context, settings *PlatformYieldSettings) error
	GetPromoCode(ctx context.Context, code string) (*PromoCode, error)
	GetActiveRedemption(ctx context.Context, userID uuid.UUID) (*PromoRedemption, error)
	HasRedeemedPromoCode(ctx context.Context, userID uuid.UUID, code string) (bool, error)
	CreateRedemption(ctx context.Context, redemption *PromoRedemption) error
	IncrementPromoUsed(ctx context.Context, code string) error
	UpdateRedemptionProgress(ctx context.Context, redemptionID uuid.UUID, progress int64, status string) error
	CreateBroadcast(ctx context.Context, broadcast *TelegramBroadcast) error
	GetBroadcast(ctx context.Context, id uuid.UUID) (*TelegramBroadcast, error)
	UpdateBroadcast(ctx context.Context, broadcast *TelegramBroadcast) error
	ListBroadcasts(ctx context.Context, limit int) ([]TelegramBroadcast, error)
	ListQueuedBroadcasts(ctx context.Context, limit int) ([]TelegramBroadcast, error)
	CreateSweep(ctx context.Context, sweep *TreasurySweep) error
	ListSweeps(ctx context.Context, limit int) ([]TreasurySweep, error)
	EnsureDefaults(ctx context.Context) error
}

type AdminRepository interface {
	RevenueSummary(ctx context.Context) (*RevenueSummary, error)
	RevenueTimeseries(ctx context.Context, days int) ([]RevenueTimeseriesPoint, error)
	ListLedger(ctx context.Context, limit int) ([]BalanceLedger, error)
	ListRiskUsers(ctx context.Context, limit int) ([]AdminRiskUser, error)
	ListAuditLogs(ctx context.Context, limit int) ([]AdminAuditLog, error)
	CreateAuditLog(ctx context.Context, log *AdminAuditLog) error
	ListUsers(ctx context.Context, query string, limit int) ([]User, error)
	CountUserBets(ctx context.Context, userID uuid.UUID, limit int) ([]GameBet, error)
}

type AnalyticsRepository interface {
	RecordEvents(ctx context.Context, events []AnalyticsEventCreate) error
	GetOverview(ctx context.Context, since time.Time, filter AnalyticsOverviewFilter) (*AnalyticsOverview, error)
	GetUserDrilldown(ctx context.Context, userID uuid.UUID, limit int, sessionID string) (*AnalyticsUserDrilldown, error)
}

type PvPRepository interface {
	CreateRoom(ctx context.Context, room *PvPRoom) error
	GetRoom(ctx context.Context, id uuid.UUID) (*PvPRoom, error)
	UpdateRoom(ctx context.Context, room *PvPRoom) error
	ListOpenRooms(ctx context.Context) ([]PvPRoom, error)
	ListOpenExpired(ctx context.Context, olderThan time.Time) ([]PvPRoom, error)
	ListActiveRooms(ctx context.Context) ([]PvPRoom, error)
	ListRecentFinishedRooms(ctx context.Context, since time.Time, limit int) ([]PvPRoom, error)
	ListCountdownDue(ctx context.Context, now time.Time) ([]PvPRoom, error)
	ListSpinningDue(ctx context.Context, now time.Time) ([]PvPRoom, error)
	HasPlayer(ctx context.Context, roomID, userID uuid.UUID) (bool, error)
	AddPlayer(ctx context.Context, player *PvPRoomPlayer) error
	ReplacePlayerGifts(ctx context.Context, roomID, userID uuid.UUID, gifts []PvPRoomPlayerGift) error
	ListRoomPlayerGifts(ctx context.Context, roomID uuid.UUID) ([]PvPRoomPlayerGift, error)
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
		initialStatus TonTransferStatus,
		riskScore int,
		riskFlags []string,
		reviewReason *string,
	) (*TonTransfer, int64, error)
	CompleteDepositAtomic(ctx context.Context, transferID uuid.UUID, txHash string, txLT int64) (int64, error)
	FailWithdrawalAtomic(ctx context.Context, transferID uuid.UUID, errMsg string) (int64, error)
	CompleteWithdrawal(ctx context.Context, transferID uuid.UUID, txHash string, txLT int64) error
	ListAll(ctx context.Context, limit int) ([]TonTransfer, error)
	ApproveWithdrawal(ctx context.Context, transferID, adminID uuid.UUID) error
	RejectWithdrawalAtomic(ctx context.Context, transferID, adminID uuid.UUID, reason string) (int64, error)
}
