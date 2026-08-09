package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type DailyQuestRepo struct {
	db *gorm.DB
}

func NewDailyQuestRepo(db *gorm.DB) *DailyQuestRepo {
	return &DailyQuestRepo{db: db}
}

func (r *DailyQuestRepo) ListQuests(ctx context.Context) ([]domain.DailyQuest, error) {
	var rows []domain.DailyQuest
	err := r.db.WithContext(ctx).Order("sort_order ASC, created_at ASC").Find(&rows).Error
	return rows, err
}

func (r *DailyQuestRepo) ListActiveQuestsForDay(ctx context.Context, dayMSK time.Time) ([]domain.DailyQuest, error) {
	day := dayMSK.Format("2006-01-02")
	var rows []domain.DailyQuest
	err := r.db.WithContext(ctx).
		Where("active = ?", true).
		Where("(active_from IS NULL OR active_from <= ?::date)", day).
		Where("(active_to IS NULL OR active_to >= ?::date)", day).
		Order("sort_order ASC, created_at ASC").
		Find(&rows).Error
	return rows, err
}

func (r *DailyQuestRepo) FindQuest(ctx context.Context, id uuid.UUID) (*domain.DailyQuest, error) {
	var row domain.DailyQuest
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *DailyQuestRepo) UpsertQuest(ctx context.Context, q *domain.DailyQuest) error {
	if q.ID == uuid.Nil {
		q.ID = uuid.New()
	}
	now := time.Now().UTC()
	if q.CreatedAt.IsZero() {
		q.CreatedAt = now
	}
	q.UpdatedAt = now
	return r.db.WithContext(ctx).Save(q).Error
}

func (r *DailyQuestRepo) DeleteQuest(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&domain.DailyQuest{}, "id = ?", id).Error
}

func (r *DailyQuestRepo) GetBoardSettings(ctx context.Context) (*domain.DailyQuestBoardSettings, error) {
	var row domain.DailyQuestBoardSettings
	err := r.db.WithContext(ctx).Where("id = ?", 1).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = domain.DailyQuestBoardSettings{
			ID:                 1,
			BonusTitle:         "Бонус дня",
			BonusDescription:   "Выполни все задания",
			BonusRewardType:    domain.DailyQuestRewardBalance,
			BonusRewardNanoton: 0,
			BonusActive:        false,
			UpdatedAt:          time.Now().UTC(),
		}
		if createErr := r.db.WithContext(ctx).Create(&row).Error; createErr != nil {
			return nil, createErr
		}
		return &row, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *DailyQuestRepo) UpdateBoardSettings(ctx context.Context, settings *domain.DailyQuestBoardSettings) error {
	settings.ID = 1
	settings.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(settings).Error
}

func (r *DailyQuestRepo) FindTaskClaim(ctx context.Context, userID, questID uuid.UUID, dayMSK time.Time) (*domain.DailyQuestClaim, error) {
	var row domain.DailyQuestClaim
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND day_msk = ?::date AND claim_kind = ? AND quest_id = ?",
			userID, dayMSK.Format("2006-01-02"), domain.DailyQuestClaimTask, questID).
		First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *DailyQuestRepo) FindBonusClaim(ctx context.Context, userID uuid.UUID, dayMSK time.Time) (*domain.DailyQuestClaim, error) {
	var row domain.DailyQuestClaim
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND day_msk = ?::date AND claim_kind = ?",
			userID, dayMSK.Format("2006-01-02"), domain.DailyQuestClaimBonus).
		First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *DailyQuestRepo) CreateClaim(ctx context.Context, claim *domain.DailyQuestClaim) error {
	if claim.ID == uuid.Nil {
		claim.ID = uuid.New()
	}
	if claim.ClaimedAt.IsZero() {
		claim.ClaimedAt = time.Now().UTC()
	}
	return r.db.WithContext(ctx).Create(claim).Error
}

func (r *DailyQuestRepo) DeleteClaim(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&domain.DailyQuestClaim{}, "id = ?", id).Error
}

func (r *DailyQuestRepo) UpdateClaimEntitlement(ctx context.Context, claimID, entitlementID uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&domain.DailyQuestClaim{}).
		Where("id = ?", claimID).
		Update("entitlement_id", entitlementID).Error
}

func (r *DailyQuestRepo) CreateEntitlement(ctx context.Context, e *domain.UserCaseEntitlement) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	if e.CreatedAt.IsZero() {
		e.CreatedAt = time.Now().UTC()
	}
	if e.Status == "" {
		e.Status = domain.CaseEntitlementAvailable
	}
	return r.db.WithContext(ctx).Create(e).Error
}

func (r *DailyQuestRepo) ClaimEntitlementForOpen(ctx context.Context, userID, caseID uuid.UUID) (*domain.UserCaseEntitlement, error) {
	var row domain.UserCaseEntitlement
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ? AND case_id = ? AND status = ?", userID, caseID, domain.CaseEntitlementAvailable).
			Order("created_at ASC").
			First(&row)
		if res.Error != nil {
			if errors.Is(res.Error, gorm.ErrRecordNotFound) {
				return domain.ErrCaseEntitlementMissing
			}
			return res.Error
		}
		now := time.Now().UTC()
		row.Status = domain.CaseEntitlementUsed
		row.UsedAt = &now
		return tx.Save(&row).Error
	})
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *DailyQuestRepo) ReleaseEntitlement(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&domain.UserCaseEntitlement{}).
		Where("id = ? AND status = ?", id, domain.CaseEntitlementUsed).
		Updates(map[string]any{
			"status":  domain.CaseEntitlementAvailable,
			"used_at": nil,
		}).Error
}

func (r *DailyQuestRepo) ListAvailableEntitlements(ctx context.Context, userID uuid.UUID) ([]domain.UserCaseEntitlement, error) {
	var rows []domain.UserCaseEntitlement
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND status = ?", userID, domain.CaseEntitlementAvailable).
		Order("created_at ASC").
		Find(&rows).Error
	return rows, err
}
