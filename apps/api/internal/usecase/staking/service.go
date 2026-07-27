package staking

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

const (
	DefaultBaseMonthlyPercent     = 3.0
	DefaultBoostMonthlyPercent    = 4.0
	DefaultBoostReferralThreshold = 10
	DaysPerMonth                  = 30
)

type AdminStakeNotifier interface {
	NotifyStake(ctx context.Context, actor telegram.AdminActor, giftName string, principalNanoton int64)
}

type Service struct {
	staking           domain.StakingRepository
	inventory         domain.InventoryRepository
	users             domain.UserRepository
	platform          domain.PlatformRepository
	scanner           telegram.ProfileGiftScanner
	valuator          *gifts.Valuator
	notifier          Notifier
	balanceNotifier   balance.BalanceNotifier
	referralThreshold int64
	analytics         *analyticsuc.Service
	referralRewards   ReferralRewardsProvider
	admin             AdminStakeNotifier
	requiredChannel   string
	channelChecker    ChannelChecker
}

// ReferralPerkProvider exposes invitee perks and first-stake activation.
type ReferralPerkProvider interface {
	OnFirstStake(ctx context.Context, userID uuid.UUID) error
	StakingBoostMonthlyPercent(ctx context.Context, userID uuid.UUID) float64
	StakeLimitBonusNanoton(ctx context.Context, userID uuid.UUID) int64
}

type ReferralRewardsProvider interface {
	ReferralPerkProvider
	AccrueDailyGGRShare(ctx context.Context, dayStart time.Time) error
}

func NewService(
	staking domain.StakingRepository,
	inventory domain.InventoryRepository,
	users domain.UserRepository,
	platform domain.PlatformRepository,
	scanner telegram.ProfileGiftScanner,
	valuator *gifts.Valuator,
	notifier Notifier,
	referralThreshold int64,
) *Service {
	if referralThreshold <= 0 {
		referralThreshold = DefaultBoostReferralThreshold
	}
	return &Service{
		staking:           staking,
		inventory:         inventory,
		users:             users,
		platform:          platform,
		scanner:           scanner,
		valuator:          valuator,
		notifier:          notifier,
		referralThreshold: referralThreshold,
	}
}

func (s *Service) monthlyRatePercents(ctx context.Context) (base float64, boost float64) {
	base = DefaultBaseMonthlyPercent
	boost = DefaultBoostMonthlyPercent
	if s.platform == nil {
		return base, boost
	}
	settings, err := s.platform.GetYieldSettings(ctx)
	if err != nil || settings == nil {
		return base, boost
	}
	if settings.StakingBaseMonthlyPercent >= 0 {
		base = settings.StakingBaseMonthlyPercent
	}
	if settings.StakingBoostMonthlyPercent >= 0 {
		boost = settings.StakingBoostMonthlyPercent
	}
	return base, boost
}

func (s *Service) SetAnalytics(analyticsSvc *analyticsuc.Service) {
	s.analytics = analyticsSvc
}

func (s *Service) SetBalanceNotifier(notifier balance.BalanceNotifier) {
	s.balanceNotifier = notifier
}

func (s *Service) SetReferralRewards(provider ReferralRewardsProvider) {
	s.referralRewards = provider
}

func (s *Service) SetAdminNotifier(notifier AdminStakeNotifier) {
	s.admin = notifier
}

func monthlyRateFraction(tier domain.StakingTier, basePercent, boostPercent float64) float64 {
	if tier == domain.TierBoost {
		return boostPercent / 100
	}
	return basePercent / 100
}

func (s *Service) Stake(ctx context.Context, userID, itemID uuid.UUID) (*domain.StakingPosition, error) {
	if err := s.ensureChannelSubscribed(ctx, userID); err != nil {
		return nil, err
	}
	item, err := s.inventory.FindByID(ctx, itemID)
	if err != nil {
		return nil, err
	}
	if item.UserID != userID {
		return nil, domain.ErrInvalidAmount
	}
	if isProfileItem(*item) {
		return s.stakeExistingItem(ctx, userID, item)
	}
	if item.Status != domain.InvAvailable {
		return nil, domain.ErrInvalidAmount
	}
	return s.createStake(ctx, userID, item, domain.StakingSourceInventory)
}

func (s *Service) Unstake(ctx context.Context, userID, positionID uuid.UUID) error {
	return errors.New("вывод из стейка доступен только в конце дня (после 00:05 МСК)")
}

func (s *Service) ListPositions(ctx context.Context, userID uuid.UUID) ([]domain.StakingPosition, error) {
	epoch, err := s.EnsureCurrentEpoch(ctx)
	if err != nil {
		return nil, err
	}
	return s.staking.ListActiveByUserEpoch(ctx, userID, epoch.ID)
}

func (s *Service) RecalculateTiers(ctx context.Context) error {
	userIDs := make(map[uuid.UUID]struct{})

	positions, err := s.staking.ListAllActive(ctx)
	if err != nil {
		return err
	}
	for _, pos := range positions {
		userIDs[pos.UserID] = struct{}{}
	}

	boostUsers, err := s.users.ListIDsByStakingTier(ctx, domain.TierBoost)
	if err != nil {
		return err
	}
	for _, id := range boostUsers {
		userIDs[id] = struct{}{}
	}

	for userID := range userIDs {
		if _, err := s.SyncBoostTier(ctx, userID); err != nil {
			return err
		}
	}
	return nil
}

// SyncBoostTier sets boost when the user invited enough people this MSK month.
func (s *Service) SyncBoostTier(ctx context.Context, userID uuid.UUID) (domain.StakingTier, error) {
	mskNow := time.Now().In(MoscowLocation())
	monthStart := time.Date(mskNow.Year(), mskNow.Month(), 1, 0, 0, 0, 0, MoscowLocation())
	monthEnd := endOfMonthMSK(mskNow)

	count, err := s.users.CountReferralsSince(ctx, userID, monthStart)
	if err != nil {
		return domain.TierBase, err
	}

	now := time.Now().UTC()
	boostEligible := count >= s.referralThreshold
	tier := domain.TierBase
	var boostUntil *time.Time
	if boostEligible {
		tier = domain.TierBoost
		until := monthEnd
		boostUntil = &until
	}

	snap := &domain.UserStakingSnapshot{
		UserID:         userID,
		ReferralCount:  count,
		BoostEligible:  boostEligible,
		BoostUntil:     boostUntil,
		ComputedAt:     now,
	}
	if err := s.staking.UpsertSnapshot(ctx, snap); err != nil {
		return tier, err
	}
	if err := s.users.UpdateStakingTier(ctx, userID, tier); err != nil {
		return tier, err
	}
	return tier, nil
}

func endOfMonthMSK(now time.Time) time.Time {
	msk := MoscowLocation()
	t := now.In(msk)
	return time.Date(t.Year(), t.Month()+1, 1, 0, 0, 0, 0, msk)
}

func isProfileItem(item domain.InventoryItem) bool {
	return strings.HasPrefix(item.TelegramTxRef, "profile:")
}

