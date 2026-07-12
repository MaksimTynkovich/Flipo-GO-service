package staking

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

func (s *Service) EnsureCurrentEpoch(ctx context.Context) (*domain.StakingEpoch, error) {
	if err := s.SettleEndedEpochs(ctx); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	epoch, err := s.staking.GetActiveEpoch(ctx, now)
	if err != nil {
		return nil, err
	}
	if epoch != nil {
		return epoch, nil
	}

	start, end := CurrentEpochBounds(now)
	epoch = &domain.StakingEpoch{
		ID:        uuid.New(),
		StartsAt:  start,
		EndsAt:    end,
		Status:    domain.EpochActive,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.staking.CreateEpoch(ctx, epoch); err != nil {
		return nil, err
	}
	return epoch, nil
}

func (s *Service) resolveGiftSlugConflict(ctx context.Context, giftSlug string, newUserID uuid.UUID) error {
	existing, err := s.staking.FindActivePositionBySlug(ctx, giftSlug)
	if err != nil {
		return err
	}
	if existing == nil || existing.UserID == newUserID {
		return nil
	}

	slog.Info("staking gift superseded",
		"gift_slug", giftSlug,
		"previous_user_id", existing.UserID,
		"new_user_id", newUserID,
	)
	return s.revokePosition(ctx, existing, domain.StakingRevokedSuperseded)
}

func (s *Service) revokePosition(ctx context.Context, pos *domain.StakingPosition, reason domain.StakingRevokeReason) error {
	if err := s.staking.DeactivateWithReason(ctx, pos.ID, reason); err != nil {
		return err
	}
	_ = s.staking.DeleteGiftClaim(ctx, pos.GiftSlug)
	return s.releaseInventoryItem(ctx, pos.InventoryItemID)
}

func (s *Service) releaseInventoryItem(ctx context.Context, itemID uuid.UUID) error {
	item, err := s.inventory.FindByID(ctx, itemID)
	if err != nil {
		return nil
	}
	if item.Status != domain.InvStaked {
		return nil
	}
	if isProfileItem(*item) {
		return s.inventory.UpdateStatus(ctx, itemID, domain.InvStaked, domain.InvDissolved)
	}
	return s.inventory.UpdateStatus(ctx, itemID, domain.InvStaked, domain.InvAvailable)
}

func (s *Service) createStake(
	ctx context.Context,
	userID uuid.UUID,
	item *domain.InventoryItem,
	source domain.StakingSource,
) (*domain.StakingPosition, error) {
	if item.TelegramGiftID == "" {
		return nil, domain.ErrInvalidAmount
	}

	epoch, err := s.EnsureCurrentEpoch(ctx)
	if err != nil {
		return nil, err
	}

	if err := s.resolveGiftSlugConflict(ctx, item.TelegramGiftID, userID); err != nil {
		return nil, err
	}

	positions, err := s.staking.ListActiveByUserEpoch(ctx, userID, epoch.ID)
	if err != nil {
		return nil, err
	}
	for _, p := range positions {
		if p.GiftSlug == item.TelegramGiftID {
			return nil, errors.New("подарок уже застейкан на этой неделе")
		}
	}

	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if item.UserID != userID {
		return nil, domain.ErrInvalidAmount
	}

	switch item.Status {
	case domain.InvAvailable:
	case domain.InvDissolved:
		if !isProfileItem(*item) {
			return nil, domain.ErrInvalidAmount
		}
	default:
		return nil, domain.ErrInvalidAmount
	}

	if err := s.inventory.UpdateStatus(ctx, item.ID, item.Status, domain.InvStaked); err != nil {
		return nil, err
	}

	principal := s.itemDisplayPrice(ctx, *item)
	if err := s.checkStakeCaps(ctx, userID, principal); err != nil {
		_ = s.inventory.UpdateStatus(ctx, item.ID, domain.InvStaked, item.Status)
		return nil, err
	}

	now := time.Now().UTC()
	pos := &domain.StakingPosition{
		ID:               uuid.New(),
		UserID:           userID,
		InventoryItemID:  item.ID,
		EpochID:          epoch.ID,
		GiftSlug:         item.TelegramGiftID,
		Source:           source,
		TierAtStake:      user.StakingTier,
		PrincipalNanoton: principal,
		LastAccrualAt:    now,
		StakedAt:         now,
		IsActive:         true,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if err := s.staking.CreatePosition(ctx, pos); err != nil {
		_ = s.inventory.UpdateStatus(ctx, item.ID, domain.InvStaked, item.Status)
		return nil, err
	}

	claim := &domain.StakingGiftClaim{
		GiftSlug:   item.TelegramGiftID,
		UserID:     userID,
		PositionID: pos.ID,
		EpochID:    epoch.ID,
		CreatedAt:  now,
	}
	if err := s.staking.UpsertGiftClaim(ctx, claim); err != nil {
		_ = s.staking.DeactivateWithReason(ctx, pos.ID, domain.StakingRevokedSuperseded)
		_ = s.inventory.UpdateStatus(ctx, item.ID, domain.InvStaked, item.Status)
		return nil, err
	}

	if s.referralRewards != nil {
		_ = s.referralRewards.OnFirstStake(ctx, userID)
	}

	return pos, nil
}

func (s *Service) checkStakeCaps(ctx context.Context, userID uuid.UUID, principal int64) error {
	if principal <= 0 {
		return domain.ErrInvalidAmount
	}

	tvlCap := domain.DefaultStakingTVLCapNanoton
	if s.platform != nil {
		if settings, err := s.platform.GetYieldSettings(ctx); err == nil && settings != nil && settings.StakingTVLCapNanoton > 0 {
			tvlCap = settings.StakingTVLCapNanoton
		}
	}

	globalTVL, err := s.staking.SumActivePrincipal(ctx)
	if err != nil {
		return err
	}
	if globalTVL+principal > tvlCap {
		return errors.New("пул стейкинга заполнен")
	}

	personalLimit, err := s.PersonalStakeLimit(ctx, userID)
	if err != nil {
		return err
	}
	userTVL, err := s.staking.SumActivePrincipalByUser(ctx, userID)
	if err != nil {
		return err
	}
	if userTVL+principal > personalLimit {
		return errors.New("личный лимит стейкинга исчерпан — выполните задания")
	}
	return nil
}

func (s *Service) PersonalStakeLimit(ctx context.Context, userID uuid.UUID) (int64, error) {
	rewards, err := s.staking.SumCompletedQuestRewards(ctx, userID)
	if err != nil {
		return 0, err
	}
	limit := domain.DefaultStakingPersonalLimitNano + rewards
	if s.referralRewards != nil {
		limit += s.referralRewards.StakeLimitBonusNanoton(ctx, userID)
	}
	return limit, nil
}

func (s *Service) TVLSnapshot(ctx context.Context) (tvl, cap, remaining int64, err error) {
	cap = domain.DefaultStakingTVLCapNanoton
	if s.platform != nil {
		if settings, settingsErr := s.platform.GetYieldSettings(ctx); settingsErr == nil && settings != nil && settings.StakingTVLCapNanoton > 0 {
			cap = settings.StakingTVLCapNanoton
		}
	}
	tvl, err = s.staking.SumActivePrincipal(ctx)
	if err != nil {
		return 0, 0, 0, err
	}
	remaining = cap - tvl
	if remaining < 0 {
		remaining = 0
	}
	return tvl, cap, remaining, nil
}
