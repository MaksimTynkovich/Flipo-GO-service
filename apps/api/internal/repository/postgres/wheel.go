package postgres

import (
	"context"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type WheelRepo struct {
	db *gorm.DB
}

func NewWheelRepo(db *gorm.DB) *WheelRepo {
	return &WheelRepo{db: db}
}

func (r *WheelRepo) ListActiveSegments(ctx context.Context) ([]domain.WheelSegment, error) {
	var rows []domain.WheelSegment
	err := r.db.WithContext(ctx).
		Where("active = ?", true).
		Order("sort_order ASC, amount_nanoton ASC").
		Find(&rows).Error
	return rows, err
}

func (r *WheelRepo) GetOrCreateState(ctx context.Context, userID uuid.UUID) (*domain.UserWheelState, error) {
	state := &domain.UserWheelState{UserID: userID}
	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(state).Error
	if err != nil {
		return nil, err
	}
	var out domain.UserWheelState
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).First(&out).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *WheelRepo) SaveState(ctx context.Context, state *domain.UserWheelState) error {
	state.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(state).Error
}

func (r *WheelRepo) AddBonusSpins(ctx context.Context, userID uuid.UUID, delta int) error {
	if delta == 0 {
		return nil
	}
	if err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&domain.UserWheelState{UserID: userID}).Error; err != nil {
		return err
	}
	return r.db.WithContext(ctx).Model(&domain.UserWheelState{}).
		Where("user_id = ?", userID).
		Updates(map[string]any{
			"bonus_spins": gorm.Expr("bonus_spins + ?", delta),
			"updated_at":  time.Now().UTC(),
		}).Error
}

func (r *WheelRepo) CountSpinsSince(ctx context.Context, userID uuid.UUID, since time.Time) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.WheelSpin{}).
		Where("user_id = ? AND created_at >= ?", userID, since.UTC()).
		Count(&count).Error
	return count, err
}

func (r *WheelRepo) CreateSpin(ctx context.Context, spin *domain.WheelSpin) error {
	return r.db.WithContext(ctx).Create(spin).Error
}

func (r *WheelRepo) ListRecentWins(ctx context.Context, limit int) ([]domain.WheelRecentWin, error) {
	if limit <= 0 {
		limit = 20
	}
	type row struct {
		Username     string
		FirstName    string
		PrizeNanoton int64
		SegmentLabel string
		CreatedAt    time.Time
	}
	var rows []row
	err := r.db.WithContext(ctx).
		Table("wheel_spins AS ws").
		Select("u.username, u.first_name, ws.prize_nanoton, seg.label AS segment_label, ws.created_at").
		Joins("JOIN users u ON u.id = ws.user_id").
		Joins("JOIN wheel_segments seg ON seg.id = ws.segment_id").
		Where("ws.spin_source <> ?", domain.WheelSpinSourceAdmin).
		Order("ws.created_at DESC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]domain.WheelRecentWin, 0, len(rows))
	for _, r := range rows {
		out = append(out, domain.WheelRecentWin{
			Username:     r.Username,
			FirstName:    r.FirstName,
			PrizeNanoton: r.PrizeNanoton,
			SegmentLabel: r.SegmentLabel,
			CreatedAt:    r.CreatedAt,
		})
	}
	return out, nil
}

func (r *WheelRepo) SumPrizesSince(ctx context.Context, since time.Time) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&domain.WheelSpin{}).
		Where("created_at >= ?", since.UTC()).
		Select("COALESCE(SUM(prize_nanoton), 0)").
		Scan(&total).Error
	return total, err
}

func (r *WheelRepo) CountSpinsGlobalSince(ctx context.Context, since time.Time) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.WheelSpin{}).
		Where("created_at >= ?", since.UTC()).
		Count(&count).Error
	return count, err
}
