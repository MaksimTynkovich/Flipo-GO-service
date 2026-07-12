package referral

import (
	"context"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

func (s *Service) OnFirstStake(ctx context.Context, userID uuid.UUID) error {
	if s.referrals == nil {
		return nil
	}
	user, err := s.users.FindByID(ctx, userID)
	if err != nil || user.ReferrerID == nil {
		return nil
	}

	now := time.Now().UTC()
	if existing, err := s.referrals.GetActivePerk(ctx, userID, now); err != nil {
		return err
	} else if existing != nil {
		return nil
	}

	perk := &domain.ReferralPerk{
		UserID:                 userID,
		StakingBoostPercent:    domain.DefaultReferralPerkBoostPercent,
		StakeLimitBonusNanoton: domain.DefaultReferralPerkLimitBonusNano,
		ActivatedAt:            now,
		ExpiresAt:              now.Add(domain.DefaultReferralPerkDuration),
	}
	return s.referrals.ActivatePerk(ctx, perk)
}

func (s *Service) StakingBoostMonthlyPercent(ctx context.Context, userID uuid.UUID) float64 {
	if s.referrals == nil {
		return 0
	}
	perk, err := s.referrals.GetActivePerk(ctx, userID, time.Now().UTC())
	if err != nil || perk == nil {
		return 0
	}
	return perk.StakingBoostPercent
}

func (s *Service) StakeLimitBonusNanoton(ctx context.Context, userID uuid.UUID) int64 {
	if s.referrals == nil {
		return 0
	}
	perk, err := s.referrals.GetActivePerk(ctx, userID, time.Now().UTC())
	if err != nil || perk == nil {
		return 0
	}
	return perk.StakeLimitBonusNanoton
}

func (s *Service) activePerk(ctx context.Context, userID uuid.UUID) (*domain.ReferralPerk, error) {
	if s.referrals == nil {
		return nil, nil
	}
	return s.referrals.GetActivePerk(ctx, userID, time.Now().UTC())
}

// OnQualifyingBet handles milestone payouts and optional welcome promo activation.
func (s *Service) OnQualifyingBet(ctx context.Context, userID uuid.UUID, betAmountNanoton int64) {
	s.MaybePayMilestone(ctx, userID, betAmountNanoton)
	s.MaybeActivateRefWelcome(ctx, userID)
}
