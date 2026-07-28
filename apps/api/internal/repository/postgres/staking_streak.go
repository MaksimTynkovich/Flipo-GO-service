package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func (r *StakingRepo) GetStreak(ctx context.Context, userID uuid.UUID) (*domain.UserStakingStreak, error) {
	var streak domain.UserStakingStreak
	err := r.db.WithContext(ctx).First(&streak, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &streak, err
}

func (r *StakingRepo) UpsertStreak(ctx context.Context, streak *domain.UserStakingStreak) error {
	streak.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(streak).Error
}

func (r *StakingRepo) ConsumeStreakBonusPayout(ctx context.Context, userID uuid.UUID) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&domain.UserStakingStreak{}).
		Where("user_id = ? AND bonus_payouts_remaining > 0", userID).
		Updates(map[string]interface{}{
			"bonus_payouts_remaining": gorm.Expr("bonus_payouts_remaining - 1"),
			"updated_at":              now,
		}).Error
}

func (r *StakingRepo) ListUserIDsWithStreakBonus(ctx context.Context) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := r.db.WithContext(ctx).Model(&domain.UserStakingStreak{}).
		Where("bonus_payouts_remaining > 0").
		Pluck("user_id", &ids).Error
	return ids, err
}

func (r *StakingRepo) BreakStreaksExcept(ctx context.Context, keepUserIDs []uuid.UUID) (int64, error) {
	now := time.Now().UTC()
	q := r.db.WithContext(ctx).Model(&domain.UserStakingStreak{}).
		Where("current_streak > 0")
	if len(keepUserIDs) > 0 {
		q = q.Where("user_id NOT IN ?", keepUserIDs)
	}
	res := q.Updates(map[string]interface{}{
		"current_streak": 0,
		"updated_at":     now,
	})
	return res.RowsAffected, res.Error
}

func (r *StakingRepo) BackdateStreaks(ctx context.Context) (int64, error) {
	res := r.db.WithContext(ctx).Exec(`
		UPDATE user_staking_streaks
		SET last_staked_msk_date = last_staked_msk_date - INTERVAL '1 day',
		    updated_at = NOW()
		WHERE last_staked_msk_date IS NOT NULL
	`)
	return res.RowsAffected, res.Error
}
