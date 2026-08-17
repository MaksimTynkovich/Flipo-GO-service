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
	EnsureSocialBotUser(ctx context.Context, id uuid.UUID, telegramID int64, username, firstName, photoURL string) (*User, error)
	UpdateWallet(ctx context.Context, userID uuid.UUID, wallet string) error
	UpdateLocale(ctx context.Context, userID uuid.UUID, locale string) error
	UpdateBanned(ctx context.Context, userID uuid.UUID, banned bool) error
	UpdateWithdrawalsDisabled(ctx context.Context, userID uuid.UUID, disabled bool) error
	UpdateBalance(ctx context.Context, userID uuid.UUID, delta int64, ledger LedgerType, refType string, refID uuid.UUID) (balanceAfter int64, adminFundedConsumed int64, err error)
	// RestoreAdminCredit puts back admin-funded balance after a failed/refunded debit.
	RestoreAdminCredit(ctx context.Context, userID uuid.UUID, amount int64) error
	GetBalanceForUpdate(ctx context.Context, userID uuid.UUID) (int64, error)
	UpdateStakingTier(ctx context.Context, userID uuid.UUID, tier StakingTier) error
	ListIDsByStakingTier(ctx context.Context, tier StakingTier) ([]uuid.UUID, error)
	SetReferrerIfEmpty(ctx context.Context, userID, referrerID uuid.UUID) (bool, error)
	SetCampaignIfEmpty(ctx context.Context, userID, campaignID uuid.UUID) (bool, error)
	SetAcquisitionPayloadIfEmpty(ctx context.Context, userID uuid.UUID, payload string) (bool, error)
	CountReferrals(ctx context.Context, referrerID uuid.UUID) (int64, error)
	CountReferralsSince(ctx context.Context, referrerID uuid.UUID, since time.Time) (int64, error)
	SumReferralEarnings(ctx context.Context, userID uuid.UUID) (int64, error)
	SumReferralEarningsByRefType(ctx context.Context, userID uuid.UUID, refType string) (int64, error)
	SumReferralEarningsSince(ctx context.Context, userID uuid.UUID, since time.Time) (int64, error)
	ListReferrals(ctx context.Context, referrerID uuid.UUID) ([]User, error)
	ListReferredUsers(ctx context.Context) ([]User, error)
	ListTelegramIDs(ctx context.Context, limit, offset int) ([]int64, error)
	ListTelegramRecipients(ctx context.Context, limit, offset int) ([]TelegramRecipient, error)
	CountUsers(ctx context.Context) (int64, error)
}

type InventoryRepository interface {
	ListByUser(ctx context.Context, userID uuid.UUID, status *InventoryStatus) ([]InventoryItem, error)
	ListByStatus(ctx context.Context, status InventoryStatus, limit int) ([]InventoryItem, error)
	FindByID(ctx context.Context, id uuid.UUID) (*InventoryItem, error)
	FindByTelegramGiftID(ctx context.Context, userID uuid.UUID, giftID string) (*InventoryItem, error)
	FindByGiftSlug(ctx context.Context, slug string) (*InventoryItem, error)
	FindActiveByGiftSlug(ctx context.Context, slug string) (*InventoryItem, error)
	FindByTelegramTxRef(ctx context.Context, txRef string) (*InventoryItem, error)
	Create(ctx context.Context, item *InventoryItem) error
	CreateGiftWithdrawal(ctx context.Context, row *GiftWithdrawal) error
	// PromoteProfileToDeposit converts a profile-virtual row into a real bot deposit
	// (tx_ref deposit:…, owned by depositor). Staked rows stay staked; others become available.
	PromoteProfileToDeposit(ctx context.Context, itemID, userID uuid.UUID, txRef string, floorPriceNanoton int64, metadata []byte, name, imageURL string) error
	UpdateStatus(ctx context.Context, id uuid.UUID, from, to InventoryStatus) error
	UpdateFloorPriceNanoton(ctx context.Context, id uuid.UUID, priceNanoton int64) error
	LockForBet(ctx context.Context, userID, itemID uuid.UUID) error
	ReleaseFromBet(ctx context.Context, itemID uuid.UUID) error
	TransferFromBet(ctx context.Context, itemID, newUserID uuid.UUID) error
	TransferOwnership(ctx context.Context, itemID, newUserID uuid.UUID, fromStatus InventoryStatus) error
	// TakeHouseGiftForCollection transfers one bot-owned gift of the collection to the user (available).
	// Optional backdrop filters metadata->>'backdrop' (Black / Onyx Black).
	TakeHouseGiftForCollection(ctx context.Context, botUserID, toUserID uuid.UUID, collectionSlug, backdrop string) (*InventoryItem, error)
	// TakeHouseGiftForModel transfers one bot-owned gift matching collection + metadata.model.
	// Optional backdrop filters metadata->>'backdrop' (Black / Onyx Black).
	TakeHouseGiftForModel(ctx context.Context, botUserID, toUserID uuid.UUID, collectionSlug, modelName, backdrop string) (*InventoryItem, error)
	// HasHouseGift reports whether bot stock has a matching gift (available or market-locked).
	HasHouseGift(ctx context.Context, botUserID uuid.UUID, collectionSlug, modelName, backdrop string) (bool, error)
	BindTelegramGift(ctx context.Context, itemID uuid.UUID, telegramGiftID, imageURL string, metadata []byte, fulfillment, telegramTxRef string) error
	GetFloorPrice(ctx context.Context, collectionSlug string) (int64, error)
	SetFloorPrice(ctx context.Context, slug string, price int64) error
}

type CaseRepository interface {
	ListActive(ctx context.Context) ([]Case, error)
	ListAll(ctx context.Context) ([]Case, error)
	FindByID(ctx context.Context, id uuid.UUID) (*Case, error)
	FindBySlug(ctx context.Context, slug string) (*Case, error)
	CreateCase(ctx context.Context, c *Case) error
	UpdateCase(ctx context.Context, c *Case) error
	DeleteCase(ctx context.Context, id uuid.UUID) error
	ListLootByCase(ctx context.Context, caseID uuid.UUID) ([]CaseLootEntry, error)
	ReplaceLoot(ctx context.Context, caseID uuid.UUID, entries []CaseLootEntry) error
	GetOrCreateState(ctx context.Context, userID uuid.UUID) (*UserCaseState, error)
	SaveState(ctx context.Context, state *UserCaseState) error
	CreateOpen(ctx context.Context, open *CaseOpen) error
	FindOpenByIdempotency(ctx context.Context, key string) (*CaseOpen, error)
	FindLatestOpenByUserCase(ctx context.Context, userID, caseID uuid.UUID) (*CaseOpen, error)
	ClaimCaseCooldown(ctx context.Context, userID, caseID uuid.UUID, cooldown time.Duration) error
	ReleaseCaseCooldown(ctx context.Context, userID, caseID uuid.UUID) error
	FindCaseCooldownClaim(ctx context.Context, userID, caseID uuid.UUID) (*UserCaseCooldown, error)
	ListDailyCooldownsReadyForNotify(ctx context.Context, cooldown time.Duration, limit int) ([]CaseCooldownReadyNotify, error)
	MarkCaseCooldownReadyNotified(ctx context.Context, userID, caseID uuid.UUID, notifiedAt time.Time) error
	ListOpensByUser(ctx context.Context, userID uuid.UUID, limit int) ([]CaseOpen, error)
	// CountPaidOpensSince counts paid case opens for progress (optional case filter).
	CountPaidOpensSince(ctx context.Context, userID uuid.UUID, since time.Time, caseID *uuid.UUID) (int64, error)
	// SumPaidOpensSince sums price_paid_nanoton for paid opens (optional case filter).
	SumPaidOpensSince(ctx context.Context, userID uuid.UUID, since time.Time, caseID *uuid.UUID) (int64, error)
	ListRecentOpens(ctx context.Context, limit int) ([]CaseLiveDrop, error)
	GetCatalogSettings(ctx context.Context) (*CaseCatalogSettings, error)
	UpdateCatalogSettings(ctx context.Context, settings *CaseCatalogSettings) error
	// ApplyCasePoolDelta adds delta to the selected pool and syncs paid-bank hysteresis.
	ApplyCasePoolDelta(ctx context.Context, kind CasePoolKind, delta int64) (*CaseCatalogSettings, error)
	// AdvancePaidRecoveryPace bumps drain/relief counter after a successful paid open in recovery.
	AdvancePaidRecoveryPace(ctx context.Context) (*CaseCatalogSettings, error)
	// CaseOpenStats aggregates paid opens for admin P&L (since optional; nil = all time).
	CaseOpenStats(ctx context.Context, since *time.Time) (*CaseOpenStats, error)
	// Detailed open-stats for admin dashboard (zero since = all time).
	CaseOpenPeriodStats(ctx context.Context, since time.Time) (CaseOpenPeriodStats, error)
	CaseOpenSourceStats(ctx context.Context, since time.Time) ([]CaseOpenSourceStats, error)
	CaseOpenPrizeTypeStats(ctx context.Context, since time.Time) ([]CaseOpenPrizeTypeStats, error)
	CaseOpenByCaseStats(ctx context.Context, since time.Time, limit int) ([]CaseOpenCaseStats, error)
	CaseOpenTopPrizes(ctx context.Context, since time.Time, limit int) ([]CaseOpenPrizeHitStats, error)
	CaseOpenByDay(ctx context.Context, since time.Time) ([]CaseOpenDailyStats, error)
	GetLiveFeedSettings(ctx context.Context) (*CaseLiveFeedSettings, error)
	UpdateLiveFeedSettings(ctx context.Context, settings *CaseLiveFeedSettings) error

	ListCasePromoCodes(ctx context.Context, caseID *uuid.UUID) ([]CasePromoCode, error)
	GetCasePromoCode(ctx context.Context, code string) (*CasePromoCode, error)
	UpsertCasePromoCode(ctx context.Context, promo *CasePromoCode) error
	DeleteCasePromoCode(ctx context.Context, code string) error
	HasRedeemedCasePromoCode(ctx context.Context, userID uuid.UUID, code string) (bool, error)
	CreateCasePromoRedemption(ctx context.Context, redemption *CasePromoRedemption) error
	DeleteCasePromoRedemption(ctx context.Context, userID uuid.UUID, code string) error
	IncrementCasePromoUsed(ctx context.Context, code string) error
	DecrementCasePromoUsed(ctx context.Context, code string) error

	GetCaseQuestShareCount(ctx context.Context, userID, caseID uuid.UUID) (int, error)
	GetCaseQuestShare(ctx context.Context, userID, caseID uuid.UUID) (*CaseQuestShare, error)
	IncrementCaseQuestShare(ctx context.Context, userID, caseID uuid.UUID) (int, error)
	ResetCaseQuestShare(ctx context.Context, userID, caseID uuid.UUID) error

	CreateCaseQuestSharePrepared(ctx context.Context, row *CaseQuestSharePrepared) error
	GetCaseQuestSharePreparedByResultID(ctx context.Context, resultID string) (*CaseQuestSharePrepared, error)
	// ConfirmCaseQuestSharePrepared sets confirmed_at once and returns whether this call was the first confirm.
	ConfirmCaseQuestSharePrepared(ctx context.Context, resultID string) (firstConfirm bool, row *CaseQuestSharePrepared, err error)
}

type MarketRepository interface {
	ListActive(ctx context.Context, limit, offset int, sort string, source *ListingSource) ([]MarketListing, error)
	ListActiveBySource(ctx context.Context, source ListingSource) ([]MarketListing, error)
	ListFiltered(ctx context.Context, filter MarketListingFilter) ([]MarketListing, int64, error)
	ListFilteredIDs(ctx context.Context, filter MarketListingFilter) ([]uuid.UUID, int64, error)
	FindByID(ctx context.Context, id uuid.UUID) (*MarketListing, error)
	ListBySeller(ctx context.Context, sellerID uuid.UUID) ([]MarketListing, error)
	FindActiveByItemID(ctx context.Context, itemID uuid.UUID) (*MarketListing, error)
	CreateListing(ctx context.Context, listing *MarketListing) error
	CancelListing(ctx context.Context, id, sellerID uuid.UUID) error
	UpdateListingPrice(ctx context.Context, listingID uuid.UUID, priceNanoton int64) error
	Purchase(ctx context.Context, listingID, buyerID uuid.UUID, price, sellerProceeds int64, fee int) (*MarketListing, error)
	SellToBot(ctx context.Context, sellerID, itemID uuid.UUID, payout, listPrice int64) (int64, error)
	SettleCaseClaim(ctx context.Context, userID, itemID uuid.UUID, payout int64) (int64, error)
	AcquireGiftFromBet(ctx context.Context, itemID uuid.UUID) error
	EnsureBotUser(ctx context.Context) (*User, error)
	CountActive(ctx context.Context) (int64, error)
	MarketStats(ctx context.Context, since *time.Time) (*MarketStats, error)
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
	SumActivePrincipal(ctx context.Context) (int64, error)
	SumActivePrincipalByUser(ctx context.Context, userID uuid.UUID) (int64, error)

	GetActiveEpoch(ctx context.Context, now time.Time) (*StakingEpoch, error)
	GetEpochDueForSettlement(ctx context.Context, now time.Time) (*StakingEpoch, error)
	CreateEpoch(ctx context.Context, epoch *StakingEpoch) error
	SettleEpoch(ctx context.Context, epochID uuid.UUID) error
	GetGiftClaim(ctx context.Context, giftSlug string) (*StakingGiftClaim, error)
	UpsertGiftClaim(ctx context.Context, claim *StakingGiftClaim) error
	DeleteGiftClaim(ctx context.Context, giftSlug string) error
	DeleteGiftClaimsByEpoch(ctx context.Context, epochID uuid.UUID) error
	FindActivePositionBySlug(ctx context.Context, giftSlug string) (*StakingPosition, error)

	ListActiveQuests(ctx context.Context) ([]StakingQuest, error)
	ListQuestCompletions(ctx context.Context, userID uuid.UUID) ([]StakingQuestCompletion, error)
	CompleteQuest(ctx context.Context, userID uuid.UUID, questCode string) error
	SumCompletedQuestRewards(ctx context.Context, userID uuid.UUID) (int64, error)
	HasAnyGameBet(ctx context.Context, userID uuid.UUID) (bool, error)
	SumWagerByGame(ctx context.Context, userID uuid.UUID, gameType GameType) (int64, error)
	SumTotalWager(ctx context.Context, userID uuid.UUID) (int64, error)
	HasPvPMatch(ctx context.Context, userID uuid.UUID) (bool, error)
	CountPvPMatches(ctx context.Context, userID uuid.UUID) (int64, error)
	SumDeposits(ctx context.Context, userID uuid.UUID) (int64, error)
	CountActiveReferrals(ctx context.Context, referrerID uuid.UUID) (int64, error)
	CountReferrals(ctx context.Context, referrerID uuid.UUID) (int64, error)
	HasCompletedEpochStake(ctx context.Context, userID uuid.UUID) (bool, error)
	HasQualifyingGameBet(ctx context.Context, userID uuid.UUID, minNanoton int64) (bool, error)

	GetStreak(ctx context.Context, userID uuid.UUID) (*UserStakingStreak, error)
	UpsertStreak(ctx context.Context, streak *UserStakingStreak) error
	ConsumeStreakBonusPayout(ctx context.Context, userID uuid.UUID) error
	ListUserIDsWithStreakBonus(ctx context.Context) ([]uuid.UUID, error)
	// BreakStreaksExcept zeroes current_streak for users not in keepUserIDs.
	BreakStreaksExcept(ctx context.Context, keepUserIDs []uuid.UUID) (int64, error)
	// BackdateStreaks moves last_staked_msk_date one day back for every streak row.
	// Dev-only helper so staking-tick can skip a calendar day even if nobody staked.
	BackdateStreaks(ctx context.Context) (int64, error)
}

type ReferralRepository interface {
	GetActivePerk(ctx context.Context, userID uuid.UUID, now time.Time) (*ReferralPerk, error)
	ActivatePerk(ctx context.Context, perk *ReferralPerk) error
	HasMilestone(ctx context.Context, referrerID, referralID uuid.UUID) (bool, error)
	CountMilestonesSince(ctx context.Context, referrerID uuid.UUID, since time.Time) (int64, error)
	CreateMilestone(ctx context.Context, milestone *ReferralMilestone) error
	SumUserPvPNetLossSince(ctx context.Context, userID uuid.UUID, since time.Time, excludeReferrerInRoom bool) (int64, error)
	CountQualifiedReferrals(ctx context.Context, referrerID uuid.UUID, minAge time.Duration, minDeposit, minStake int64) (int64, error)
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
	// SumWagerByGameSince sums bet stakes for a game since watermark (excludes refunded).
	SumWagerByGameSince(ctx context.Context, userID uuid.UUID, gameType GameType, since time.Time) (int64, error)
	// CountRouletteWinsWithMultSince counts won roulette bets whose color mult >= minMult (e.g. 50).
	CountRouletteWinsWithMultSince(ctx context.Context, userID uuid.UUID, since time.Time, minMult int64) (int64, error)
	// CountCrashCashoutsSince counts crash cashouts with cashout_multiplier >= minMult.
	CountCrashCashoutsSince(ctx context.Context, userID uuid.UUID, since time.Time, minMult float64) (int64, error)
	// MaxRouletteColorStreakSince returns the longest run of correct roulette rounds since watermark.
	MaxRouletteColorStreakSince(ctx context.Context, userID uuid.UUID, since time.Time) (int64, error)
	SumUserSettledBetsSince(ctx context.Context, userID uuid.UUID, since time.Time) (int64, error)
	SumUserRefundsSince(ctx context.Context, userID uuid.UUID, since time.Time) (int64, error)
	SumRoundBets(ctx context.Context, roundID uuid.UUID) (int64, error)
	GameStats(ctx context.Context) ([]AdminGameStat, error)
}

type PlatformRepository interface {
	GetGameConfig(ctx context.Context, gameType GameType) (*GameConfig, error)
	ListGameConfigs(ctx context.Context) ([]GameConfig, error)
	UpsertGameConfig(ctx context.Context, cfg *GameConfig) error
	GetRiskSettings(ctx context.Context) (*PlatformRiskSettings, error)
	UpdateRiskSettings(ctx context.Context, settings *PlatformRiskSettings) error
	// ApplyRouletteBankDelta adds delta to the roulette house bank and syncs recovery hysteresis.
	ApplyRouletteBankDelta(ctx context.Context, delta int64) (*PlatformRiskSettings, error)
	// ApplyCrashBankDelta adds delta to the crash house bank and syncs recovery hysteresis.
	ApplyCrashBankDelta(ctx context.Context, delta int64) (*PlatformRiskSettings, error)
	GetActiveSeed(ctx context.Context, gameType GameType) (*ProvablyFairSeedSession, error)
	CreateSeedSession(ctx context.Context, session *ProvablyFairSeedSession) error
	DeactivateSeeds(ctx context.Context, gameType GameType) error
	ListSeedHistory(ctx context.Context, gameType GameType, limit int) ([]ProvablyFairSeedSession, error)
	ListPromoCodes(ctx context.Context) ([]PromoCode, error)
	UpsertPromoCode(ctx context.Context, promo *PromoCode) error
	DeletePromoCode(ctx context.Context, code string) error
	GetBotSettings(ctx context.Context) (*TelegramBotSettings, error)
	UpdateBotSettings(ctx context.Context, settings *TelegramBotSettings) error
	GetMaintenanceSettings(ctx context.Context) (*PlatformMaintenanceSettings, error)
	UpdateMaintenanceSettings(ctx context.Context, settings *PlatformMaintenanceSettings) error
	GetWithdrawalSettings(ctx context.Context) (*PlatformWithdrawalSettings, error)
	UpdateWithdrawalSettings(ctx context.Context, settings *PlatformWithdrawalSettings) error
	GetDepositSettings(ctx context.Context) (*PlatformDepositSettings, error)
	UpdateDepositSettings(ctx context.Context, settings *PlatformDepositSettings) error
	GetYieldSettings(ctx context.Context) (*PlatformYieldSettings, error)
	UpdateYieldSettings(ctx context.Context, settings *PlatformYieldSettings) error
	GetPromoCode(ctx context.Context, code string) (*PromoCode, error)
	HasRedeemedPromoCode(ctx context.Context, userID uuid.UUID, code string) (bool, error)
	CreateRedemption(ctx context.Context, redemption *PromoRedemption) error
	DeleteRedemption(ctx context.Context, id uuid.UUID) error
	IncrementPromoUsed(ctx context.Context, code string) error
	// ClaimPromoRedemption inserts redemption + bumps used_count under locks before balance credit.
	ClaimPromoRedemption(ctx context.Context, userID uuid.UUID, code string, bonusNanoton int64) (*PromoRedemption, error)
	ReleasePromoRedemption(ctx context.Context, redemptionID uuid.UUID, code string) error
	CreateBroadcast(ctx context.Context, broadcast *TelegramBroadcast) error
	GetBroadcast(ctx context.Context, id uuid.UUID) (*TelegramBroadcast, error)
	UpdateBroadcast(ctx context.Context, broadcast *TelegramBroadcast) error
	ListBroadcasts(ctx context.Context, limit int) ([]TelegramBroadcast, error)
	ListQueuedBroadcasts(ctx context.Context, limit int) ([]TelegramBroadcast, error)
	UpsertBroadcastDelivery(ctx context.Context, delivery *TelegramBroadcastDelivery) error
	ListBroadcastDeliveries(ctx context.Context, broadcastID uuid.UUID, status string, limit, offset int) ([]TelegramBroadcastDelivery, int64, error)
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
	ListUsers(ctx context.Context, query, sort string, minReferrals, limit int) ([]AdminUserRow, error)
	UserAudience(ctx context.Context) (*AdminUserAudience, error)
	ListUserBets(ctx context.Context, userID uuid.UUID, since *time.Time, limit int) ([]GameBet, error)
	UserBetsSummary(ctx context.Context, userID uuid.UUID, since *time.Time) (AdminUserBetsSummary, error)
	ListUserTransfers(ctx context.Context, userID uuid.UUID, since *time.Time, limit int) ([]TonTransfer, error)
	UserTransfersSummary(ctx context.Context, userID uuid.UUID, since *time.Time) (AdminUserTransfersSummary, error)
	ListUserLedger(ctx context.Context, userID uuid.UUID, since *time.Time, limit int) ([]BalanceLedger, error)
	ListUserInventory(ctx context.Context, userID uuid.UUID, limit int) ([]InventoryItem, error)
	ListUserCaseOpens(ctx context.Context, userID uuid.UUID, since *time.Time, limit int) ([]AdminUserCaseOpenItem, error)
	ListUserMarketBuysByItemIDs(ctx context.Context, userID uuid.UUID, itemIDs []uuid.UUID) (map[uuid.UUID]int64, error)
	StakingOverview(ctx context.Context) (*AdminStakingOverview, error)
	ListStakingEpochs(ctx context.Context, limit, offset int) ([]AdminStakingEpochRow, int64, error)
	ListStakingPositions(ctx context.Context, filter AdminStakingPositionFilter) ([]AdminStakingPositionRow, int64, error)
	ListStakingActivity(ctx context.Context, filter AdminStakingActivityFilter) ([]AdminStakingActivityRow, int64, error)
	ListStakingStakers(ctx context.Context, filter AdminStakingStakerFilter) ([]AdminStakingStakerRow, int64, int64, error)
}

type CampaignRepository interface {
	Create(ctx context.Context, campaign *Campaign) error
	Update(ctx context.Context, campaign *Campaign) error
	FindByID(ctx context.Context, id uuid.UUID) (*Campaign, error)
	FindByCode(ctx context.Context, code string) (*Campaign, error)
	List(ctx context.Context) ([]Campaign, error)
	Stats(ctx context.Context, filter CampaignStatsFilter) ([]CampaignStats, error)
	Daily(ctx context.Context, campaignID uuid.UUID, from, to time.Time) ([]CampaignDailyPoint, error)
}

type AdminNotificationRepository interface {
	CreateAdminNotification(ctx context.Context, n *AdminNotification) error
	ListAdminNotifications(ctx context.Context, filter AdminNotificationFilter) ([]AdminNotification, error)
	CountAdminNotifications(ctx context.Context, filter AdminNotificationFilter) (int64, error)
	CountUnreadAdminNotifications(ctx context.Context, category string) (int64, error)
	MarkAdminNotificationRead(ctx context.Context, id uuid.UUID) error
	MarkAllAdminNotificationsRead(ctx context.Context, category string) (int64, error)
}

type AnalyticsRepository interface {
	RecordEvents(ctx context.Context, events []AnalyticsEventCreate) error
	GetOverview(ctx context.Context, since time.Time, filter AnalyticsOverviewFilter) (*AnalyticsOverview, error)
	GetUserDrilldown(ctx context.Context, userID uuid.UUID, limit int, sessionID string) (*AnalyticsUserDrilldown, error)
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
	ListPendingDeposits(ctx context.Context, now time.Time, limit int) ([]TonTransfer, error)
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
	// CompleteDepositAtomic credits the user once. credited is true only on the first successful completion;
	// repeat calls for an already-completed transfer return (balance, false, nil).
	CompleteDepositAtomic(ctx context.Context, transferID uuid.UUID, txHash string, txLT int64) (balanceAfter int64, credited bool, err error)
	ClaimWithdrawalBroadcast(ctx context.Context, transferID uuid.UUID) (bool, error)
	FailWithdrawalAtomic(ctx context.Context, transferID uuid.UUID, errMsg string) (int64, error)
	CompleteWithdrawal(ctx context.Context, transferID uuid.UUID, txHash string, txLT int64) error
	ListAll(ctx context.Context, limit int) ([]TonTransfer, error)
	ApproveWithdrawal(ctx context.Context, transferID, adminID uuid.UUID) error
	RejectWithdrawalAtomic(ctx context.Context, transferID, adminID uuid.UUID, reason string) (int64, error)
}

type PaymentIntentRepository interface {
	Create(ctx context.Context, intent *PaymentIntent) error
	Update(ctx context.Context, intent *PaymentIntent) error
	FindByID(ctx context.Context, id uuid.UUID) (*PaymentIntent, error)
	FindByIDForUser(ctx context.Context, id, userID uuid.UUID) (*PaymentIntent, error)
	FindByPayload(ctx context.Context, payload string) (*PaymentIntent, error)
	FindByProviderInvoiceID(ctx context.Context, provider, invoiceID string) (*PaymentIntent, error)
	ListAwaiting(ctx context.Context, provider string, olderThan time.Duration, limit int) ([]PaymentIntent, error)
	MarkExpired(ctx context.Context, intentID uuid.UUID) error
	CompleteAtomic(ctx context.Context, intentID uuid.UUID) (balanceAfter int64, credited bool, err error)
}

// GiftTraitPriceKey identifies a cached trait valuation row.
type GiftTraitPriceKey struct {
	CollectionSlug string
	Model          string
	Backdrop       string
}

// GiftTraitPriceRepository persists gift valuations by collection+model (+ black backdrop).
type GiftTraitPriceRepository interface {
	Get(ctx context.Context, collectionSlug, model, backdrop string) (*GiftTraitPrice, error)
	Upsert(ctx context.Context, price *GiftTraitPrice) error
	ListAll(ctx context.Context) ([]GiftTraitPrice, error)
	ListKeysFromInventory(ctx context.Context) ([]GiftTraitPriceKey, error)
	ListFiltered(ctx context.Context, filter GiftTraitPriceFilter) ([]GiftTraitPrice, int64, error)
	ListFilterOptions(ctx context.Context, collectionSlug, model string) (GiftTraitPriceFilterOptions, error)
}

type GiftTraitPriceFilter struct {
	CollectionSlug string
	Model          string
	Backdrop       string
	Limit          int
	Offset         int
}

type GiftTraitPriceFilterOptions struct {
	Collections []string `json:"collections"`
	Models      []string `json:"models"`
	Backdrops   []string `json:"backdrops"`
}

// OutcomeOverrideRepository — admin-scheduled game outcome overrides.
type OutcomeOverrideRepository interface {
	CreateOutcomeOverride(ctx context.Context, override *GameOutcomeOverride) error
	ListOutcomeOverrides(ctx context.Context) ([]GameOutcomeOverride, error)
	DeleteOutcomeOverride(ctx context.Context, id uuid.UUID) error
	// TakePending atomically fetches and decrements the next active override for a
	// game type. Returns (nil, false) when none remain or all are expired.
	TakePending(ctx context.Context, gameType GameType) (*GameOutcomeOverride, bool, error)
}

// DailyQuestRepository — daily quest catalog, claims, board bonus, case entitlements.
type DailyQuestRepository interface {
	ListQuests(ctx context.Context) ([]DailyQuest, error)
	ListActiveQuestsForDay(ctx context.Context, dayMSK time.Time) ([]DailyQuest, error)
	FindQuest(ctx context.Context, id uuid.UUID) (*DailyQuest, error)
	UpsertQuest(ctx context.Context, q *DailyQuest) error
	DeleteQuest(ctx context.Context, id uuid.UUID) error

	GetBoardSettings(ctx context.Context) (*DailyQuestBoardSettings, error)
	UpdateBoardSettings(ctx context.Context, settings *DailyQuestBoardSettings) error

	FindTaskClaim(ctx context.Context, userID, questID uuid.UUID, dayMSK time.Time) (*DailyQuestClaim, error)
	FindBonusClaim(ctx context.Context, userID uuid.UUID, dayMSK time.Time) (*DailyQuestClaim, error)
	CreateClaim(ctx context.Context, claim *DailyQuestClaim) error
	DeleteClaim(ctx context.Context, id uuid.UUID) error
	// ResetClaimsForDay deletes claims for the MSK day (optionally one user) and unused free-case
	// entitlements granted by those claims. Returns deleted claim count.
	ResetClaimsForDay(ctx context.Context, dayMSK time.Time, userID *uuid.UUID) (int64, error)
	UpdateClaimEntitlement(ctx context.Context, claimID, entitlementID uuid.UUID) error

	// UpsertProgressBaseline sets the per-user progress watermark for the MSK day.
	UpsertProgressBaseline(ctx context.Context, userID uuid.UUID, dayMSK, progressSince time.Time) error
	GetProgressBaseline(ctx context.Context, userID uuid.UUID, dayMSK time.Time) (*DailyQuestProgressBaseline, error)
	SetBoardProgressEpoch(ctx context.Context, epoch time.Time) error

	CreateEntitlement(ctx context.Context, e *UserCaseEntitlement) error
	// ClaimEntitlementForOpen marks one available entitlement as used; returns it or ErrCaseEntitlementMissing.
	ClaimEntitlementForOpen(ctx context.Context, userID, caseID uuid.UUID) (*UserCaseEntitlement, error)
	ReleaseEntitlement(ctx context.Context, id uuid.UUID) error
	ListAvailableEntitlements(ctx context.Context, userID uuid.UUID) ([]UserCaseEntitlement, error)

	// Admin analytics (sinceDayMSK empty = all time; otherwise day_msk >= since).
	ClaimPeriodStats(ctx context.Context, sinceDayMSK time.Time) (DailyQuestClaimPeriodStats, error)
	ClaimsByQuest(ctx context.Context, sinceDayMSK time.Time) ([]DailyQuestClaimByQuestStats, error)
	ClaimsByRewardType(ctx context.Context, sinceDayMSK time.Time) ([]DailyQuestClaimByRewardStats, error)
	ClaimsByDayMSK(ctx context.Context, sinceDayMSK time.Time) ([]DailyQuestClaimsDailyStats, error)
	EntitlementStats(ctx context.Context, since time.Time) (DailyQuestEntitlementStats, error)
	QuestCaseOpenStats(ctx context.Context, since time.Time) (DailyQuestCaseOpenStats, error)
}
