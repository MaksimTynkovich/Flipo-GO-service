package postgres

import (
	"context"
	"fmt"
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

func (r *WheelRepo) ListAllSegments(ctx context.Context) ([]domain.WheelSegment, error) {
	var rows []domain.WheelSegment
	err := r.db.WithContext(ctx).
		Order("sort_order ASC, amount_nanoton ASC").
		Find(&rows).Error
	return rows, err
}

func (r *WheelRepo) UpdateSegment(ctx context.Context, seg *domain.WheelSegment) error {
	if seg == nil {
		return fmt.Errorf("nil segment")
	}
	res := r.db.WithContext(ctx).Model(&domain.WheelSegment{}).
		Where("id = ?", seg.ID).
		Updates(map[string]any{
			"label":           seg.Label,
			"amount_nanoton":  seg.AmountNanoton,
			"weight":          seg.Weight,
			"sort_order":      seg.SortOrder,
			"active":          seg.Active,
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
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

// TryAddReferralBonusSpin atomically grants one referral bonus spin when under dailyLimit for the given calendar day.
func (r *WheelRepo) TryAddReferralBonusSpin(ctx context.Context, userID uuid.UUID, day time.Time, dailyLimit int) (bool, error) {
	if dailyLimit <= 0 {
		return false, nil
	}
	if err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&domain.UserWheelState{UserID: userID}).Error; err != nil {
		return false, err
	}

	dayDate := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.UTC)
	res := r.db.WithContext(ctx).Exec(`
		UPDATE user_wheel_state
		SET
			bonus_spins = bonus_spins + 1,
			referral_bonus_grants_today = CASE
				WHEN referral_bonus_grants_date IS NOT DISTINCT FROM ?::date THEN referral_bonus_grants_today + 1
				ELSE 1
			END,
			referral_bonus_grants_date = ?::date,
			updated_at = NOW()
		WHERE user_id = ?
		  AND (
			referral_bonus_grants_date IS DISTINCT FROM ?::date
			OR referral_bonus_grants_today < ?
		  )
	`, dayDate, dayDate, userID, dayDate, dailyLimit)
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
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

func (r *WheelRepo) SumPrizesSince(ctx context.Context, since time.Time) (int64, error) {
	var total int64
	q := r.db.WithContext(ctx).Model(&domain.WheelSpin{}).
		Where("spin_source <> ?", domain.WheelSpinSourceAdmin)
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since.UTC())
	}
	err := q.Select("COALESCE(SUM(prize_nanoton), 0)").Scan(&total).Error
	return total, err
}

func (r *WheelRepo) CountSpinsGlobalSince(ctx context.Context, since time.Time) (int64, error) {
	var count int64
	q := r.db.WithContext(ctx).Model(&domain.WheelSpin{}).
		Where("spin_source <> ?", domain.WheelSpinSourceAdmin)
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since.UTC())
	}
	err := q.Count(&count).Error
	return count, err
}

func (r *WheelRepo) AdminPeriodStats(ctx context.Context, since time.Time) (domain.WheelPeriodStats, error) {
	type row struct {
		Spins         int64
		UniqueUsers   int64
		PrizesNanoton int64
	}
	var out row
	q := r.db.WithContext(ctx).Model(&domain.WheelSpin{}).
		Select("COUNT(*) AS spins, COUNT(DISTINCT user_id) AS unique_users, COALESCE(SUM(prize_nanoton), 0) AS prizes_nanoton").
		Where("spin_source <> ?", domain.WheelSpinSourceAdmin)
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since.UTC())
	}
	if err := q.Scan(&out).Error; err != nil {
		return domain.WheelPeriodStats{}, err
	}
	return domain.WheelPeriodStats{
		Spins:         out.Spins,
		UniqueUsers:   out.UniqueUsers,
		PrizesNanoton: out.PrizesNanoton,
	}, nil
}

func (r *WheelRepo) AdminSourceStats(ctx context.Context, since time.Time) ([]domain.WheelSourceStats, error) {
	type row struct {
		Source        string
		Spins         int64
		PrizesNanoton int64
	}
	var rows []row
	q := r.db.WithContext(ctx).Model(&domain.WheelSpin{}).
		Select("spin_source AS source, COUNT(*) AS spins, COALESCE(SUM(prize_nanoton), 0) AS prizes_nanoton").
		Where("spin_source <> ?", domain.WheelSpinSourceAdmin).
		Group("spin_source").
		Order("spin_source ASC")
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since.UTC())
	}
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]domain.WheelSourceStats, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.WheelSourceStats{
			Source:        item.Source,
			Spins:         item.Spins,
			PrizesNanoton: item.PrizesNanoton,
		})
	}
	return out, nil
}

func (r *WheelRepo) AdminSegmentHits(ctx context.Context) ([]domain.WheelSegmentHitStats, error) {
	type row struct {
		SegmentID          uuid.UUID
		Label              string
		AmountNanoton      int64
		Hits               int64
		TotalPrizesNanoton int64
	}
	var rows []row
	err := r.db.WithContext(ctx).
		Table("wheel_spins AS ws").
		Select(`ws.segment_id,
			COALESCE(seg.label, '—') AS label,
			COALESCE(MAX(seg.amount_nanoton), 0) AS amount_nanoton,
			COUNT(*) AS hits,
			COALESCE(SUM(ws.prize_nanoton), 0) AS total_prizes_nanoton`).
		Joins("LEFT JOIN wheel_segments seg ON seg.id = ws.segment_id").
		Where("ws.spin_source <> ?", domain.WheelSpinSourceAdmin).
		Group("ws.segment_id, seg.label").
		Order("hits DESC, total_prizes_nanoton DESC").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]domain.WheelSegmentHitStats, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.WheelSegmentHitStats{
			SegmentID:          item.SegmentID,
			Label:              item.Label,
			AmountNanoton:      item.AmountNanoton,
			Hits:               item.Hits,
			TotalPrizesNanoton: item.TotalPrizesNanoton,
		})
	}
	return out, nil
}

func (r *WheelRepo) AdminSpinsByDay(ctx context.Context, since time.Time) ([]domain.WheelDailyStats, error) {
	type row struct {
		Day           time.Time
		Spins         int64
		UniqueUsers   int64
		PrizesNanoton int64
	}
	var rows []row
	q := r.db.WithContext(ctx).Model(&domain.WheelSpin{}).
		Select(`date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
			COUNT(*) AS spins,
			COUNT(DISTINCT user_id) AS unique_users,
			COALESCE(SUM(prize_nanoton), 0) AS prizes_nanoton`).
		Where("spin_source <> ?", domain.WheelSpinSourceAdmin).
		Group("day").
		Order("day ASC")
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since.UTC())
	}
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]domain.WheelDailyStats, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.WheelDailyStats{
			Date:          item.Day.UTC(),
			Spins:         item.Spins,
			UniqueUsers:   item.UniqueUsers,
			PrizesNanoton: item.PrizesNanoton,
		})
	}
	return out, nil
}

func (r *WheelRepo) SumPendingBonusSpins(ctx context.Context) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&domain.UserWheelState{}).
		Select("COALESCE(SUM(bonus_spins), 0)").
		Scan(&total).Error
	return total, err
}

func (r *WheelRepo) GetSegmentByID(ctx context.Context, id uuid.UUID) (*domain.WheelSegment, error) {
	var seg domain.WheelSegment
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&seg).Error
	if err != nil {
		return nil, err
	}
	return &seg, nil
}

func (r *WheelRepo) UpsertPendingOverride(ctx context.Context, userID, segmentID, createdBy uuid.UUID, note string) (*domain.WheelSpinOverride, error) {
	var out domain.WheelSpinOverride
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing domain.WheelSpinOverride
		err := tx.Where("user_id = ? AND consumed_at IS NULL", userID).First(&existing).Error
		if err == nil {
			existing.SegmentID = segmentID
			existing.CreatedBy = createdBy
			existing.Note = note
			existing.CreatedAt = time.Now().UTC()
			if err := tx.Save(&existing).Error; err != nil {
				return err
			}
			out = existing
			return nil
		}
		if err != gorm.ErrRecordNotFound {
			return err
		}
		row := domain.WheelSpinOverride{
			ID:        uuid.New(),
			UserID:    userID,
			SegmentID: segmentID,
			CreatedBy: createdBy,
			Note:      note,
			CreatedAt: time.Now().UTC(),
		}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		out = row
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *WheelRepo) ListPendingOverrides(ctx context.Context) ([]domain.WheelSpinOverrideView, error) {
	type row struct {
		ID            uuid.UUID
		UserID        uuid.UUID
		TelegramID    int64
		Username      string
		FirstName     string
		SegmentID     uuid.UUID
		SegmentLabel  string
		AmountNanoton int64
		Note          string
		CreatedAt     time.Time
	}
	var rows []row
	err := r.db.WithContext(ctx).Raw(`
		SELECT
			o.id,
			o.user_id,
			u.telegram_id,
			COALESCE(u.username, '') AS username,
			COALESCE(u.first_name, '') AS first_name,
			o.segment_id,
			COALESCE(seg.label, '') AS segment_label,
			COALESCE(seg.amount_nanoton, 0) AS amount_nanoton,
			COALESCE(o.note, '') AS note,
			o.created_at
		FROM wheel_spin_overrides o
		JOIN users u ON u.id = o.user_id
		JOIN wheel_segments seg ON seg.id = o.segment_id
		WHERE o.consumed_at IS NULL
		ORDER BY o.created_at DESC
	`).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]domain.WheelSpinOverrideView, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.WheelSpinOverrideView{
			ID:            item.ID,
			UserID:        item.UserID,
			TelegramID:    item.TelegramID,
			Username:      item.Username,
			FirstName:     item.FirstName,
			SegmentID:     item.SegmentID,
			SegmentLabel:  item.SegmentLabel,
			AmountNanoton: item.AmountNanoton,
			Note:          item.Note,
			CreatedAt:     item.CreatedAt,
		})
	}
	return out, nil
}

func (r *WheelRepo) DeletePendingOverride(ctx context.Context, id uuid.UUID) error {
	res := r.db.WithContext(ctx).
		Where("id = ? AND consumed_at IS NULL", id).
		Delete(&domain.WheelSpinOverride{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *WheelRepo) ConsumePendingOverride(ctx context.Context, userID uuid.UUID) (*domain.WheelSpinOverride, error) {
	var out domain.WheelSpinOverride
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row domain.WheelSpinOverride
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ? AND consumed_at IS NULL", userID).
			Order("created_at ASC").
			First(&row).Error
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		row.ConsumedAt = &now
		if err := tx.Model(&domain.WheelSpinOverride{}).
			Where("id = ? AND consumed_at IS NULL", row.ID).
			Update("consumed_at", now).Error; err != nil {
			return err
		}
		out = row
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}
