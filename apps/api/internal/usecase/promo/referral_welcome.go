package promo

import (
	"context"
	"errors"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

// ActivateReferralWelcome grants the REF_WELCOME promo to referred users after eligibility checks.
func (s *Service) ActivateReferralWelcome(ctx context.Context, userID uuid.UUID) error {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	if user.ReferrerID == nil {
		return nil
	}
	if time.Since(user.CreatedAt) < 24*time.Hour {
		return nil
	}

	redeemed, err := s.platform.HasRedeemedPromoCode(ctx, userID, domain.RefWelcomePromoCode)
	if err != nil || redeemed {
		return err
	}

	if err := s.ensureChannelSubscribed(ctx, userID); err != nil {
		return nil
	}

	active, err := s.platform.GetActiveRedemption(ctx, userID)
	if err != nil {
		return err
	}
	if active != nil {
		return nil
	}

	promo, err := s.platform.GetPromoCode(ctx, domain.RefWelcomePromoCode)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil
		}
		return err
	}
	if !promo.Active {
		return nil
	}

	wagerRequired := int64(float64(promo.BonusNanoton) * promo.WagerMultiplier)
	if wagerRequired <= 0 {
		wagerRequired = promo.BonusNanoton
	}

	redemptionID := uuid.New()
	if _, err := s.balance.Credit(ctx, userID, promo.BonusNanoton, domain.LedgerPromoBonus, "promo_code", redemptionID); err != nil {
		return err
	}

	redemption := &domain.PromoRedemption{
		ID:                   redemptionID,
		UserID:               userID,
		PromoCode:            promo.Code,
		BonusNanoton:         promo.BonusNanoton,
		WagerRequiredNanoton: wagerRequired,
		MaxCashoutNanoton:    domain.RefWelcomeMaxCashoutNano,
		Status:               "active",
	}
	if err := s.platform.CreateRedemption(ctx, redemption); err != nil {
		return err
	}
	_ = s.platform.IncrementPromoUsed(ctx, promo.Code)
	return nil
}

func (s *Service) applyPromoCashoutCap(ctx context.Context, userID uuid.UUID, redemption *domain.PromoRedemption) {
	if redemption == nil || redemption.MaxCashoutNanoton <= 0 {
		return
	}
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return
	}
	allowed := redemption.BonusNanoton + redemption.MaxCashoutNanoton
	if user.BettingBalance <= allowed {
		return
	}
	excess := user.BettingBalance - allowed
	if excess <= 0 {
		return
	}
	_, _ = s.users.UpdateBalance(ctx, userID, -excess, domain.LedgerBet, "promo_cap", redemption.ID)
}
