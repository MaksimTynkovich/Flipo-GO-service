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

	promo, err := s.platform.GetPromoCode(ctx, domain.RefWelcomePromoCode)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) || errors.Is(err, domain.ErrPromoInvalid) {
			return nil
		}
		return err
	}
	if !promo.Active {
		return nil
	}

	redemption, err := s.platform.ClaimPromoRedemption(ctx, userID, promo.Code, promo.BonusNanoton)
	if err != nil {
		if errors.Is(err, domain.ErrPromoAlreadyRedeemed) ||
			errors.Is(err, domain.ErrPromoExhausted) ||
			errors.Is(err, domain.ErrPromoInvalid) ||
			errors.Is(err, domain.ErrPromoExpired) {
			return nil
		}
		return err
	}
	if _, err := s.balance.Credit(ctx, userID, redemption.BonusNanoton, domain.LedgerPromoBonus, "promo_code", redemption.ID); err != nil {
		_ = s.platform.ReleasePromoRedemption(ctx, redemption.ID, promo.Code)
		return err
	}
	return nil
}
