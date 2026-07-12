package postgres

import (
	"context"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type OutcomeOverrideRepo struct {
	db *gorm.DB
}

func NewOutcomeOverrideRepo(db *gorm.DB) *OutcomeOverrideRepo {
	return &OutcomeOverrideRepo{db: db}
}

func (r *OutcomeOverrideRepo) CreateOutcomeOverride(ctx context.Context, override *domain.GameOutcomeOverride) error {
	return r.db.WithContext(ctx).Create(override).Error
}

func (r *OutcomeOverrideRepo) ListOutcomeOverrides(ctx context.Context) ([]domain.GameOutcomeOverride, error) {
	var items []domain.GameOutcomeOverride
	if err := r.db.WithContext(ctx).
		Where("rounds_remaining > 0").
		Order("created_at DESC").
		Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

func (r *OutcomeOverrideRepo) DeleteOutcomeOverride(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&domain.GameOutcomeOverride{}).Error
}

// TakePending atomically claims the oldest active override for a game type,
// decrementing its remaining count. Expired overrides are cleared first.
func (r *OutcomeOverrideRepo) TakePending(ctx context.Context, gameType domain.GameType) (*domain.GameOutcomeOverride, bool, error) {
	now := time.Now().UTC()

	if err := r.db.WithContext(ctx).
		Where("game_type = ? AND expires_at IS NOT NULL AND expires_at < ?", gameType, now).
		Delete(&domain.GameOutcomeOverride{}).Error; err != nil {
		return nil, false, err
	}

	var override domain.GameOutcomeOverride
	err := r.db.WithContext(ctx).
		Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
		Where("game_type = ? AND rounds_remaining > 0", gameType).
		Order("created_at ASC").
		First(&override).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, false, nil
		}
		return nil, false, err
	}

	override.RoundsRemaining--
	if err := r.db.WithContext(ctx).Model(&domain.GameOutcomeOverride{}).
		Where("id = ?", override.ID).
		Update("rounds_remaining", override.RoundsRemaining).Error; err != nil {
		return nil, false, err
	}

	return &override, true, nil
}
