package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func (r *StakingRepo) GetActiveEpoch(ctx context.Context, now time.Time) (*domain.StakingEpoch, error) {
	var epoch domain.StakingEpoch
	err := r.db.WithContext(ctx).
		Where("status = ? AND starts_at <= ? AND ends_at > ?", domain.EpochActive, now, now).
		Order("starts_at DESC").
		First(&epoch).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &epoch, nil
}

func (r *StakingRepo) GetEpochDueForSettlement(ctx context.Context, now time.Time) (*domain.StakingEpoch, error) {
	var epoch domain.StakingEpoch
	err := r.db.WithContext(ctx).
		Where("status = ? AND ends_at <= ?", domain.EpochActive, now).
		Order("ends_at ASC").
		First(&epoch).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &epoch, nil
}

func (r *StakingRepo) CreateEpoch(ctx context.Context, epoch *domain.StakingEpoch) error {
	return r.db.WithContext(ctx).Create(epoch).Error
}

func (r *StakingRepo) SettleEpoch(ctx context.Context, epochID uuid.UUID) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&domain.StakingEpoch{}).
		Where("id = ? AND status = ?", epochID, domain.EpochActive).
		Updates(map[string]interface{}{
			"status":     domain.EpochSettled,
			"updated_at": now,
		}).Error
}

func (r *StakingRepo) ListActiveByUserEpoch(ctx context.Context, userID, epochID uuid.UUID) ([]domain.StakingPosition, error) {
	var positions []domain.StakingPosition
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND epoch_id = ? AND is_active = ?", userID, epochID, true).
		Find(&positions).Error
	return positions, err
}

func (r *StakingRepo) ListAllActiveEpoch(ctx context.Context, epochID uuid.UUID) ([]domain.StakingPosition, error) {
	var positions []domain.StakingPosition
	err := r.db.WithContext(ctx).
		Where("epoch_id = ? AND is_active = ?", epochID, true).
		Find(&positions).Error
	return positions, err
}

func (r *StakingRepo) DeactivateWithReason(ctx context.Context, positionID uuid.UUID, reason domain.StakingRevokeReason) error {
	now := time.Now().UTC()
	reasonStr := string(reason)
	return r.db.WithContext(ctx).Model(&domain.StakingPosition{}).
		Where("id = ? AND is_active = ?", positionID, true).
		Updates(map[string]interface{}{
			"is_active":      false,
			"unstaked_at":    now,
			"revoked_reason": reasonStr,
			"updated_at":     now,
		}).Error
}

func (r *StakingRepo) GetGiftClaim(ctx context.Context, giftSlug string) (*domain.StakingGiftClaim, error) {
	var claim domain.StakingGiftClaim
	err := r.db.WithContext(ctx).First(&claim, "gift_slug = ?", giftSlug).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &claim, nil
}

func (r *StakingRepo) UpsertGiftClaim(ctx context.Context, claim *domain.StakingGiftClaim) error {
	return r.db.WithContext(ctx).Save(claim).Error
}

func (r *StakingRepo) DeleteGiftClaim(ctx context.Context, giftSlug string) error {
	return r.db.WithContext(ctx).Delete(&domain.StakingGiftClaim{}, "gift_slug = ?", giftSlug).Error
}

func (r *StakingRepo) DeleteGiftClaimsByEpoch(ctx context.Context, epochID uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&domain.StakingGiftClaim{}, "epoch_id = ?", epochID).Error
}

func (r *StakingRepo) FindActivePositionBySlug(ctx context.Context, giftSlug string) (*domain.StakingPosition, error) {
	var pos domain.StakingPosition
	err := r.db.WithContext(ctx).
		Where("gift_slug = ? AND is_active = ?", giftSlug, true).
		First(&pos).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &pos, nil
}
