package referral

import (
	"context"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

type InviteeStatus struct {
	HasReferrer            bool    `json:"has_referrer"`
	PerksActive            bool    `json:"perks_active"`
	PerksPending           bool    `json:"perks_pending"`
	StakingBoostPercent    float64 `json:"staking_boost_percent"`
	StakeLimitBonusNanoton int64   `json:"stake_limit_bonus_nanoton"`
	ExpiresAt              *string `json:"expires_at,omitempty"`
}

func (s *Service) GetInviteeStatus(ctx context.Context, userID uuid.UUID) (*InviteeStatus, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	status := &InviteeStatus{}
	if user.ReferrerID == nil {
		return status, nil
	}

	status.HasReferrer = true
	status.StakingBoostPercent = domain.DefaultReferralPerkBoostPercent
	status.StakeLimitBonusNanoton = domain.DefaultReferralPerkLimitBonusNano

	if s.referrals == nil {
		status.PerksPending = true
		return status, nil
	}

	perk, err := s.referrals.GetActivePerk(ctx, userID, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	if perk != nil && perk.Active(time.Now().UTC()) {
		status.PerksActive = true
		status.StakingBoostPercent = perk.StakingBoostPercent
		status.StakeLimitBonusNanoton = perk.StakeLimitBonusNanoton
		expires := perk.ExpiresAt.UTC().Format(time.RFC3339)
		status.ExpiresAt = &expires
		return status, nil
	}

	status.PerksPending = true
	return status, nil
}
