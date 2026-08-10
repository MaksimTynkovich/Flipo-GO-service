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
			PromoSlides:        domain.DefaultDailyQuestPromoSlides(),
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

func (r *DailyQuestRepo) ResetClaimsForDay(ctx context.Context, dayMSK time.Time, userID *uuid.UUID) (int64, error) {
	day := dayMSK.Format("2006-01-02")
	var deleted int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q := tx.Model(&domain.DailyQuestClaim{}).Where("day_msk = ?::date", day)
		if userID != nil {
			q = q.Where("user_id = ?", *userID)
		}

		var claimIDs []uuid.UUID
		if err := q.Pluck("id", &claimIDs).Error; err != nil {
			return err
		}
		if len(claimIDs) == 0 {
			deleted = 0
			return nil
		}

		if err := tx.
			Where("source = ? AND status = ? AND source_ref IN ?",
				domain.CaseEntitlementSourceDailyQuest,
				domain.CaseEntitlementAvailable,
				claimIDs).
			Delete(&domain.UserCaseEntitlement{}).Error; err != nil {
			return err
		}

		res := tx.Where("id IN ?", claimIDs).Delete(&domain.DailyQuestClaim{})
		if res.Error != nil {
			return res.Error
		}
		deleted = res.RowsAffected
		return nil
	})
	return deleted, err
}

func (r *DailyQuestRepo) UpdateClaimEntitlement(ctx context.Context, claimID, entitlementID uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&domain.DailyQuestClaim{}).
		Where("id = ?", claimID).
		Update("entitlement_id", entitlementID).Error
}

func (r *DailyQuestRepo) UpsertProgressBaseline(ctx context.Context, userID uuid.UUID, dayMSK, progressSince time.Time) error {
	row := domain.DailyQuestProgressBaseline{
		UserID:        userID,
		DayMSK:        dayMSK,
		ProgressSince: progressSince.UTC(),
	}
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "day_msk"}},
		DoUpdates: clause.AssignmentColumns([]string{"progress_since"}),
	}).Create(&row).Error
}

func (r *DailyQuestRepo) GetProgressBaseline(ctx context.Context, userID uuid.UUID, dayMSK time.Time) (*domain.DailyQuestProgressBaseline, error) {
	var row domain.DailyQuestProgressBaseline
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND day_msk = ?::date", userID, dayMSK.Format("2006-01-02")).
		First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *DailyQuestRepo) SetBoardProgressEpoch(ctx context.Context, epoch time.Time) error {
	return r.db.WithContext(ctx).Model(&domain.DailyQuestBoardSettings{}).
		Where("id = ?", 1).
		Updates(map[string]any{
			"progress_epoch": epoch.UTC(),
			"updated_at":     time.Now().UTC(),
		}).Error
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

func claimSinceDay(sinceDayMSK time.Time) (string, bool) {
	if sinceDayMSK.IsZero() {
		return "", false
	}
	return sinceDayMSK.Format("2006-01-02"), true
}

func (r *DailyQuestRepo) ClaimPeriodStats(ctx context.Context, sinceDayMSK time.Time) (domain.DailyQuestClaimPeriodStats, error) {
	type row struct {
		TaskClaims           int64
		BonusClaims          int64
		UniqueClaimers       int64
		TaskClaimers         int64
		BonusClaimers        int64
		RewardNanotonTotal   int64
		BalanceRewardNanoton int64
		GiftRewardNanoton    int64
		FreeCaseClaims       int64
	}
	var out row
	q := r.db.WithContext(ctx).Model(&domain.DailyQuestClaim{}).
		Select(`
			COUNT(*) FILTER (WHERE claim_kind = 'task') AS task_claims,
			COUNT(*) FILTER (WHERE claim_kind = 'bonus') AS bonus_claims,
			COUNT(DISTINCT user_id) AS unique_claimers,
			COUNT(DISTINCT user_id) FILTER (WHERE claim_kind = 'task') AS task_claimers,
			COUNT(DISTINCT user_id) FILTER (WHERE claim_kind = 'bonus') AS bonus_claimers,
			COALESCE(SUM(reward_nanoton), 0) AS reward_nanoton_total,
			COALESCE(SUM(reward_nanoton) FILTER (WHERE reward_type = 'balance_nanoton'), 0) AS balance_reward_nanoton,
			COALESCE(SUM(reward_nanoton) FILTER (WHERE reward_type = 'gift'), 0) AS gift_reward_nanoton,
			COUNT(*) FILTER (WHERE reward_type = 'free_case_open') AS free_case_claims`)
	if day, ok := claimSinceDay(sinceDayMSK); ok {
		q = q.Where("day_msk >= ?::date", day)
	}
	if err := q.Scan(&out).Error; err != nil {
		return domain.DailyQuestClaimPeriodStats{}, err
	}
	return domain.DailyQuestClaimPeriodStats{
		TaskClaims:           out.TaskClaims,
		BonusClaims:          out.BonusClaims,
		UniqueClaimers:       out.UniqueClaimers,
		TaskClaimers:         out.TaskClaimers,
		BonusClaimers:        out.BonusClaimers,
		RewardNanotonTotal:   out.RewardNanotonTotal,
		BalanceRewardNanoton: out.BalanceRewardNanoton,
		GiftRewardNanoton:    out.GiftRewardNanoton,
		FreeCaseClaims:       out.FreeCaseClaims,
	}, nil
}

func (r *DailyQuestRepo) ClaimsByQuest(ctx context.Context, sinceDayMSK time.Time) ([]domain.DailyQuestClaimByQuestStats, error) {
	type row struct {
		QuestID            uuid.UUID
		Title              string
		Active             bool
		SortOrder          int
		TaskClaims         int64
		UniqueUsers        int64
		RewardNanotonTotal int64
		RewardType         string
	}
	var rows []row
	q := r.db.WithContext(ctx).
		Table("daily_quest_claims AS c").
		Select(`
			c.quest_id AS quest_id,
			COALESCE(q.title, 'Удалённое задание') AS title,
			COALESCE(q.active, false) AS active,
			COALESCE(q.sort_order, 0) AS sort_order,
			COUNT(*) AS task_claims,
			COUNT(DISTINCT c.user_id) AS unique_users,
			COALESCE(SUM(c.reward_nanoton), 0) AS reward_nanoton_total,
			COALESCE(MAX(c.reward_type), '') AS reward_type`).
		Joins("LEFT JOIN daily_quests q ON q.id = c.quest_id").
		Where("c.claim_kind = ? AND c.quest_id IS NOT NULL", domain.DailyQuestClaimTask).
		Group("c.quest_id, q.title, q.active, q.sort_order").
		Order("task_claims DESC, sort_order ASC")
	if day, ok := claimSinceDay(sinceDayMSK); ok {
		q = q.Where("c.day_msk >= ?::date", day)
	}
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]domain.DailyQuestClaimByQuestStats, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.DailyQuestClaimByQuestStats{
			QuestID:            item.QuestID,
			Title:              item.Title,
			Active:             item.Active,
			SortOrder:          item.SortOrder,
			TaskClaims:         item.TaskClaims,
			UniqueUsers:        item.UniqueUsers,
			RewardNanotonTotal: item.RewardNanotonTotal,
			RewardType:         item.RewardType,
		})
	}
	return out, nil
}

func (r *DailyQuestRepo) ClaimsByRewardType(ctx context.Context, sinceDayMSK time.Time) ([]domain.DailyQuestClaimByRewardStats, error) {
	type row struct {
		RewardType         string
		Claims             int64
		UniqueUsers        int64
		RewardNanotonTotal int64
	}
	var rows []row
	q := r.db.WithContext(ctx).Model(&domain.DailyQuestClaim{}).
		Select(`
			reward_type,
			COUNT(*) AS claims,
			COUNT(DISTINCT user_id) AS unique_users,
			COALESCE(SUM(reward_nanoton), 0) AS reward_nanoton_total`).
		Group("reward_type").
		Order("claims DESC")
	if day, ok := claimSinceDay(sinceDayMSK); ok {
		q = q.Where("day_msk >= ?::date", day)
	}
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]domain.DailyQuestClaimByRewardStats, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.DailyQuestClaimByRewardStats{
			RewardType:         item.RewardType,
			Claims:             item.Claims,
			UniqueUsers:        item.UniqueUsers,
			RewardNanotonTotal: item.RewardNanotonTotal,
		})
	}
	return out, nil
}

func (r *DailyQuestRepo) ClaimsByDayMSK(ctx context.Context, sinceDayMSK time.Time) ([]domain.DailyQuestClaimsDailyStats, error) {
	type row struct {
		DayMSK             time.Time
		TaskClaims         int64
		BonusClaims        int64
		UniqueClaimers     int64
		RewardNanotonTotal int64
	}
	var rows []row
	q := r.db.WithContext(ctx).Model(&domain.DailyQuestClaim{}).
		Select(`
			day_msk,
			COUNT(*) FILTER (WHERE claim_kind = 'task') AS task_claims,
			COUNT(*) FILTER (WHERE claim_kind = 'bonus') AS bonus_claims,
			COUNT(DISTINCT user_id) AS unique_claimers,
			COALESCE(SUM(reward_nanoton), 0) AS reward_nanoton_total`).
		Group("day_msk").
		Order("day_msk ASC")
	if day, ok := claimSinceDay(sinceDayMSK); ok {
		q = q.Where("day_msk >= ?::date", day)
	}
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]domain.DailyQuestClaimsDailyStats, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.DailyQuestClaimsDailyStats{
			DayMSK:             item.DayMSK.Format("2006-01-02"),
			TaskClaims:         item.TaskClaims,
			BonusClaims:        item.BonusClaims,
			UniqueClaimers:     item.UniqueClaimers,
			RewardNanotonTotal: item.RewardNanotonTotal,
		})
	}
	return out, nil
}

func (r *DailyQuestRepo) EntitlementStats(ctx context.Context, since time.Time) (domain.DailyQuestEntitlementStats, error) {
	type row struct {
		Granted   int64
		Used      int64
		Available int64
	}
	var out row
	q := r.db.WithContext(ctx).Model(&domain.UserCaseEntitlement{}).
		Where("source = ?", domain.CaseEntitlementSourceDailyQuest).
		Select(`
			COUNT(*) AS granted,
			COUNT(*) FILTER (WHERE status = 'used') AS used,
			COUNT(*) FILTER (WHERE status = 'available') AS available`)
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since.UTC())
	}
	if err := q.Scan(&out).Error; err != nil {
		return domain.DailyQuestEntitlementStats{}, err
	}
	return domain.DailyQuestEntitlementStats{
		Granted:   out.Granted,
		Used:      out.Used,
		Available: out.Available,
	}, nil
}

func (r *DailyQuestRepo) QuestCaseOpenStats(ctx context.Context, since time.Time) (domain.DailyQuestCaseOpenStats, error) {
	type row struct {
		Opens             int64
		UniqueUsers       int64
		PrizeTotalNanoton int64
	}
	var out row
	q := r.db.WithContext(ctx).Model(&domain.CaseOpen{}).
		Where("source = ?", domain.CaseOpenSourceQuest).
		Select(`
			COUNT(*) AS opens,
			COUNT(DISTINCT user_id) AS unique_users,
			COALESCE(SUM(prize_nanoton), 0) AS prize_total_nanoton`)
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since.UTC())
	}
	if err := q.Scan(&out).Error; err != nil {
		return domain.DailyQuestCaseOpenStats{}, err
	}
	return domain.DailyQuestCaseOpenStats{
		Opens:             out.Opens,
		UniqueUsers:       out.UniqueUsers,
		PrizeTotalNanoton: out.PrizeTotalNanoton,
	}, nil
}
