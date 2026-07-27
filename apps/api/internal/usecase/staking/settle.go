package staking

import (
	"context"
	"log/slog"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/flipo/flipo/apps/api/internal/usecase/referral"
	"github.com/google/uuid"
)

// SettleEndedEpochs pays yield for due epochs (no MTProto), unlocks gifts, and sends one Telegram message.
// Cron: every day 00:05 MSK. Also used for cutover of legacy weekly epochs.
func (s *Service) SettleEndedEpochs(ctx context.Context) error {
	now := time.Now().UTC()
	for {
		epoch, err := s.staking.GetEpochDueForSettlement(ctx, now)
		if err != nil {
			return err
		}
		if epoch == nil {
			return nil
		}
		if err := s.settleEpoch(ctx, epoch); err != nil {
			return err
		}
	}
}

func (s *Service) settleEpoch(ctx context.Context, epoch *domain.StakingEpoch) error {
	positions, err := s.staking.ListAllActiveEpoch(ctx, epoch.ID)
	if err != nil {
		return err
	}

	// Pay one full daily yield per position (no ownership rescan, no first-day skip).
	// Legacy weekly cutover settles without backfill (payDays=0) — unlock only.
	payDays := 1
	if isLegacyEpoch(epoch.StartsAt, epoch.EndsAt) {
		payDays = 0
		slog.Info("staking legacy epoch cutover without yield backfill",
			"epoch_id", epoch.ID,
			"starts_at", epoch.StartsAt,
			"ends_at", epoch.EndsAt,
			"positions", len(positions),
		)
	}

	userYield := make(map[uuid.UUID]int64)
	basePercent, boostPercent := s.monthlyRatePercents(ctx)
	sharePercent := referral.DefaultSharePercent
	if s.platform != nil {
		if settings, err := s.platform.GetYieldSettings(ctx); err == nil && settings != nil && settings.ReferralSharePercent >= 0 {
			sharePercent = settings.ReferralSharePercent
		}
	}

	msk := MoscowLocation()
	dayStart := epoch.StartsAt.In(msk)
	dayStart = time.Date(dayStart.Year(), dayStart.Month(), dayStart.Day(), 0, 0, 0, 0, msk)
	payoutRefID := dailyPayoutRefID(dayStart)

	if payDays > 0 {
		for _, pos := range positions {
			user, err := s.users.FindByID(ctx, pos.UserID)
			if err != nil {
				slog.Warn("staking settle user lookup failed", "position_id", pos.ID, "error", err)
				continue
			}
			rate := monthlyRateFraction(user.StakingTier, basePercent, boostPercent)
			if s.referralRewards != nil {
				rate += s.referralRewards.StakingBoostMonthlyPercent(ctx, pos.UserID) / 100
			}
			dailyYield := int64(float64(pos.PrincipalNanoton) * rate / DaysPerMonth)
			if dailyYield <= 0 {
				continue
			}
			if err := s.staking.UpdateAccrual(ctx, pos.ID, dailyYield); err != nil {
				return err
			}
			userYield[pos.UserID] += dailyYield
		}

		for userID, yield := range userYield {
			if yield <= 0 {
				continue
			}
			if _, err := s.users.UpdateBalance(ctx, userID, yield, domain.LedgerStakeYield, "staking_daily", payoutRefID); err != nil {
				slog.Warn("daily staking payout failed", "user_id", userID, "error", err)
				continue
			}
			balance.NotifyUser(ctx, s.users, s.balanceNotifier, userID, yield, domain.LedgerStakeYield)
			if s.analytics != nil {
				if user, err := s.users.FindByID(ctx, userID); err == nil {
					s.analytics.Track(ctx, analyticsuc.EventInput{
						UserID:        &userID,
						ReferrerID:    user.ReferrerID,
						TelegramID:    &user.TelegramID,
						Source:        "worker",
						EventName:     "staking_yield_paid",
						EventCategory: "staking",
						Status:        "success",
						StakingTier:   string(user.StakingTier),
						Properties: map[string]any{
							"amount_nanoton": yield,
						},
					})
				}
			}
		}

		referrerBonuses := make(map[uuid.UUID]int64)
		for userID, yield := range userYield {
			if yield <= 0 {
				continue
			}
			user, err := s.users.FindByID(ctx, userID)
			if err != nil || user.ReferrerID == nil {
				continue
			}
			bonus := referral.BonusFromYield(yield, sharePercent)
			if bonus > 0 {
				referrerBonuses[*user.ReferrerID] += bonus
			}
		}
		for referrerID, bonus := range referrerBonuses {
			if _, err := s.users.UpdateBalance(ctx, referrerID, bonus, domain.LedgerReferralBonus, "referral_daily", payoutRefID); err != nil {
				slog.Warn("daily referral payout failed", "referrer_id", referrerID, "error", err)
				continue
			}
			balance.NotifyUser(ctx, s.users, s.balanceNotifier, referrerID, bonus, domain.LedgerReferralBonus)
			if s.analytics != nil {
				if user, err := s.users.FindByID(ctx, referrerID); err == nil {
					s.analytics.Track(ctx, analyticsuc.EventInput{
						UserID:        &referrerID,
						ReferrerID:    user.ReferrerID,
						TelegramID:    &user.TelegramID,
						Source:        "worker",
						EventName:     "referral_bonus_paid",
						EventCategory: "staking",
						Status:        "success",
						StakingTier:   string(user.StakingTier),
						Properties: map[string]any{
							"amount_nanoton": bonus,
						},
					})
				}
			}
		}

		if s.referralRewards != nil {
			if err := s.referralRewards.AccrueDailyGGRShare(ctx, dayStart); err != nil {
				slog.Warn("referral ggr accrual failed", "error", err)
			}
		}

		// One Telegram message per affected user (yield and/or referral bonus and/or unlock).
		if s.notifier != nil {
			notifyUsers := make(map[uuid.UUID]struct{}, len(positions)+len(referrerBonuses))
			for _, pos := range positions {
				notifyUsers[pos.UserID] = struct{}{}
			}
			for referrerID := range referrerBonuses {
				notifyUsers[referrerID] = struct{}{}
			}
			for userID := range notifyUsers {
				user, err := s.users.FindByID(ctx, userID)
				if err != nil {
					continue
				}
				yield := userYield[userID]
				bonus := referrerBonuses[userID]
				if err := s.notifier.SendDailyStakingSettled(ctx, user.TelegramID, yield, bonus); err != nil {
					slog.Warn("daily staking settled notify failed", "user_id", userID, "error", err)
				}
			}
		}
	} else if s.notifier != nil {
		// Legacy cutover: unlock-only message.
		notified := make(map[uuid.UUID]bool)
		for _, pos := range positions {
			if notified[pos.UserID] {
				continue
			}
			notified[pos.UserID] = true
			user, err := s.users.FindByID(ctx, pos.UserID)
			if err != nil {
				continue
			}
			_ = s.notifier.SendDailyStakingSettled(ctx, user.TelegramID, 0, 0)
		}
	}

	for _, pos := range positions {
		if err := s.revokePosition(ctx, &pos, domain.StakingRevokedEpochEnd); err != nil {
			slog.Warn("staking epoch revoke failed", "position_id", pos.ID, "error", err)
		}
	}

	_ = s.staking.DeleteGiftClaimsByEpoch(ctx, epoch.ID)
	return s.staking.SettleEpoch(ctx, epoch.ID)
}

func dailyPayoutRefID(day time.Time) uuid.UUID {
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte("staking-daily:"+day.In(MoscowLocation()).Format("2006-01-02")))
}
