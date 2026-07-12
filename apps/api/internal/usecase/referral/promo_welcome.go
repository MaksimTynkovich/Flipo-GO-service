package referral

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type PromoActivator interface {
	ActivateReferralWelcome(ctx context.Context, userID uuid.UUID) error
}

func (s *Service) SetPromoActivator(activator PromoActivator) {
	s.promoActivator = activator
}

func (s *Service) MaybeActivateRefWelcome(ctx context.Context, userID uuid.UUID) {
	if s.promoActivator == nil {
		return
	}
	user, err := s.users.FindByID(ctx, userID)
	if err != nil || user.ReferrerID == nil {
		return
	}
	if time.Since(user.CreatedAt) < 24*time.Hour {
		return
	}
	_ = s.promoActivator.ActivateReferralWelcome(ctx, userID)
}
