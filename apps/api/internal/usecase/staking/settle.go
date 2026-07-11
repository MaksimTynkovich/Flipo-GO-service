package staking

import (
	"context"
	"log/slog"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

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

	userYield := make(map[uuid.UUID]int64)
	for _, pos := range positions {
		if pos.AccruedYieldNanoton > 0 {
			userYield[pos.UserID] += pos.AccruedYieldNanoton
		}
		if err := s.revokePosition(ctx, &pos, domain.StakingRevokedEpochEnd); err != nil {
			slog.Warn("staking epoch revoke failed", "position_id", pos.ID, "error", err)
		} else {
			s.maybeCompleteFullEpochQuest(ctx, pos.UserID)
		}
	}

	if s.notifier != nil {
		for userID, total := range userYield {
			user, err := s.users.FindByID(ctx, userID)
			if err != nil {
				continue
			}
			if err := s.notifier.SendWeeklyStakingComplete(ctx, user.TelegramID, total); err != nil {
				slog.Warn("weekly staking notify failed", "user_id", userID, "error", err)
			}
		}
		notified := make(map[uuid.UUID]bool, len(userYield))
		for uid := range userYield {
			notified[uid] = true
		}
		for _, pos := range positions {
			if notified[pos.UserID] {
				continue
			}
			notified[pos.UserID] = true
			user, err := s.users.FindByID(ctx, pos.UserID)
			if err != nil {
				continue
			}
			_ = s.notifier.SendWeeklyStakingComplete(ctx, user.TelegramID, 0)
		}
	}

	_ = s.staking.DeleteGiftClaimsByEpoch(ctx, epoch.ID)
	return s.staking.SettleEpoch(ctx, epoch.ID)
}
