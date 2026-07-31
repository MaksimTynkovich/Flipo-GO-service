package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type CaseRepo struct {
	db *gorm.DB
}

func NewCaseRepo(db *gorm.DB) *CaseRepo {
	return &CaseRepo{db: db}
}

func (r *CaseRepo) ListActive(ctx context.Context) ([]domain.Case, error) {
	var rows []domain.Case
	err := r.db.WithContext(ctx).
		Where("active = ?", true).
		Order("sort_order ASC, price_nanoton ASC").
		Find(&rows).Error
	return rows, err
}

func (r *CaseRepo) ListAll(ctx context.Context) ([]domain.Case, error) {
	var rows []domain.Case
	err := r.db.WithContext(ctx).
		Order("sort_order ASC, price_nanoton ASC").
		Find(&rows).Error
	return rows, err
}

func (r *CaseRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.Case, error) {
	var row domain.Case
	if err := r.db.WithContext(ctx).First(&row, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *CaseRepo) FindBySlug(ctx context.Context, slug string) (*domain.Case, error) {
	var row domain.Case
	if err := r.db.WithContext(ctx).Where("slug = ?", slug).First(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *CaseRepo) CreateCase(ctx context.Context, c *domain.Case) error {
	now := time.Now().UTC()
	if c.CreatedAt.IsZero() {
		c.CreatedAt = now
	}
	c.UpdatedAt = now
	return r.db.WithContext(ctx).Create(c).Error
}

func (r *CaseRepo) UpdateCase(ctx context.Context, c *domain.Case) error {
	c.UpdatedAt = time.Now().UTC()
	res := r.db.WithContext(ctx).Model(&domain.Case{}).Where("id = ?", c.ID).Updates(map[string]any{
		"title":           c.Title,
		"image_url":       c.ImageURL,
		"accent_color":    c.AccentColor,
		"price_nanoton":   c.PriceNanoton,
		"kind":            c.Kind,
		"sort_order":      c.SortOrder,
		"active":          c.Active,
		"require_channel": c.RequireChannel,
		"target_rtp_bps":  c.TargetRTPBPS,
		"updated_at":      c.UpdatedAt,
	})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *CaseRepo) DeleteCase(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Delete(&domain.Case{}, "id = ?", id)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return domain.ErrNotFound
		}
		// Soft-deleted cases stay for FK (opens); deactivate linked promos.
		if err := tx.Model(&domain.CasePromoCode{}).
			Where("case_id = ?", id).
			Update("active", false).Error; err != nil {
			return err
		}
		return nil
	})
}

func (r *CaseRepo) ListLootByCase(ctx context.Context, caseID uuid.UUID) ([]domain.CaseLootEntry, error) {
	var rows []domain.CaseLootEntry
	err := r.db.WithContext(ctx).
		Where("case_id = ?", caseID).
		Order("sort_order ASC, weight DESC").
		Find(&rows).Error
	return rows, err
}

func (r *CaseRepo) ReplaceLoot(ctx context.Context, caseID uuid.UUID, entries []domain.CaseLootEntry) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("case_id = ?", caseID).Delete(&domain.CaseLootEntry{}).Error; err != nil {
			return err
		}
		for i := range entries {
			entries[i].CaseID = caseID
			if entries[i].ID == uuid.Nil {
				entries[i].ID = uuid.New()
			}
			if entries[i].CreatedAt.IsZero() {
				entries[i].CreatedAt = time.Now().UTC()
			}
			if err := tx.Create(&entries[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *CaseRepo) GetOrCreateState(ctx context.Context, userID uuid.UUID) (*domain.UserCaseState, error) {
	state := &domain.UserCaseState{UserID: userID}
	if err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(state).Error; err != nil {
		return nil, err
	}
	var out domain.UserCaseState
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).First(&out).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *CaseRepo) SaveState(ctx context.Context, state *domain.UserCaseState) error {
	state.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(state).Error
}

func (r *CaseRepo) CreateOpen(ctx context.Context, open *domain.CaseOpen) error {
	if open.CreatedAt.IsZero() {
		open.CreatedAt = time.Now().UTC()
	}
	return r.db.WithContext(ctx).Create(open).Error
}

func (r *CaseRepo) FindOpenByIdempotency(ctx context.Context, key string) (*domain.CaseOpen, error) {
	var open domain.CaseOpen
	if err := r.db.WithContext(ctx).Where("idempotency_key = ?", key).First(&open).Error; err != nil {
		return nil, err
	}
	return &open, nil
}

func (r *CaseRepo) FindLatestOpenByUserCase(ctx context.Context, userID, caseID uuid.UUID) (*domain.CaseOpen, error) {
	var open domain.CaseOpen
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND case_id = ?", userID, caseID).
		Order("created_at DESC").
		First(&open).Error
	if err != nil {
		return nil, err
	}
	return &open, nil
}

func (r *CaseRepo) ListOpensByUser(ctx context.Context, userID uuid.UUID, limit int) ([]domain.CaseOpen, error) {
	if limit <= 0 {
		limit = 50
	}
	var rows []domain.CaseOpen
	err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (r *CaseRepo) ListRecentOpens(ctx context.Context, limit int) ([]domain.CaseLiveDrop, error) {
	if limit <= 0 {
		limit = 24
	}
	type row struct {
		OpenID              uuid.UUID
		PrizeType           string
		CollectionSlug      string
		DisplayName         string
		ImageURL            string
		RarityLabel         string
		TileBackgroundColor string
		Backdrop            string
		FloorPriceNanoton   int64
		CreatedAt           time.Time
	}
	var rows []row
	err := r.db.WithContext(ctx).
		Table("case_opens AS o").
		Select(`o.id AS open_id,
			COALESCE(NULLIF(o.prize_type, ''), NULLIF(e.prize_type, ''), 'gift') AS prize_type,
			e.collection_slug,
			e.display_name,
			e.image_url,
			e.rarity_label,
			e.tile_background_color,
			e.backdrop,
			CASE
				WHEN COALESCE(NULLIF(o.prize_type, ''), NULLIF(e.prize_type, ''), 'gift') = 'ton'
					THEN COALESCE(NULLIF(o.prize_nanoton, 0), NULLIF(e.amount_nanoton, 0), e.floor_price_nanoton)
				ELSE e.floor_price_nanoton
			END AS floor_price_nanoton,
			o.created_at`).
		Joins("JOIN case_loot_entries e ON e.id = o.loot_entry_id").
		Order("o.created_at DESC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]domain.CaseLiveDrop, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.CaseLiveDrop{
			OpenID:              row.OpenID,
			PrizeType:           row.PrizeType,
			CollectionSlug:      row.CollectionSlug,
			DisplayName:         row.DisplayName,
			ImageURL:            row.ImageURL,
			RarityLabel:         row.RarityLabel,
			TileBackgroundColor: row.TileBackgroundColor,
			Backdrop:            row.Backdrop,
			FloorPriceNanoton:   row.FloorPriceNanoton,
			CreatedAt:           row.CreatedAt,
		})
	}
	return out, nil
}

func (r *CaseRepo) GetCatalogSettings(ctx context.Context) (*domain.CaseCatalogSettings, error) {
	var row domain.CaseCatalogSettings
	err := r.db.WithContext(ctx).First(&row, "id = ?", 1).Error
	if err == nil {
		domain.SyncCaseBankHysteresis(&row)
		return &row, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}
	row = domain.CaseCatalogSettings{
		ID:                            1,
		Enabled:                       true,
		BannersEnabled:                false,
		BankLossThresholdNanoton:      -50_000_000_000,
		BankBiasWeight:                50,
		BankMaxPrizeBps:               5000,
		BankRecoverySmoothEnabled:     true,
		BankRecoveryDrainOpens:        2,
		BankRecoveryReliefOpens:       1,
		BankRecoveryReliefMaxPrizeBps: 3000,
		DailyPoolMaxPrizeBps:          5000,
		PromoPoolMaxPrizeBps:          5000,
		UpdatedAt:                     time.Now().UTC(),
	}
	if createErr := r.db.WithContext(ctx).Create(&row).Error; createErr != nil {
		return nil, createErr
	}
	return &row, nil
}

func (r *CaseRepo) UpdateCatalogSettings(ctx context.Context, settings *domain.CaseCatalogSettings) error {
	settings.ID = 1
	settings.UpdatedAt = time.Now().UTC()
	domain.SyncCaseBankHysteresis(settings)
	// Use a map so false bools are written (GORM Updates omits zero-value fields otherwise).
	res := r.db.WithContext(ctx).Model(&domain.CaseCatalogSettings{}).Where("id = ?", 1).Updates(catalogSettingsUpdateMap(settings))
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return r.db.WithContext(ctx).Create(settings).Error
	}
	return nil
}

func catalogSettingsUpdateMap(s *domain.CaseCatalogSettings) map[string]any {
	return map[string]any{
		"enabled":                             s.Enabled,
		"banners_enabled":                     s.BannersEnabled,
		"bank_enabled":                        s.BankEnabled,
		"bank_nanoton":                        s.BankNanoton,
		"bank_target_nanoton":                 s.BankTargetNanoton,
		"bank_loss_threshold_nanoton":         s.BankLossThresholdNanoton,
		"bank_recovery_target_nanoton":        s.BankRecoveryTargetNanoton,
		"bank_recovery_active":                s.BankRecoveryActive,
		"bank_bias_weight":                    s.BankBiasWeight,
		"bank_max_prize_bps":                  s.BankMaxPrizeBps,
		"bank_fat_paused":                     s.BankFatPaused,
		"bank_recovery_smooth_enabled":        s.BankRecoverySmoothEnabled,
		"bank_recovery_drain_opens":           s.BankRecoveryDrainOpens,
		"bank_recovery_relief_opens":          s.BankRecoveryReliefOpens,
		"bank_recovery_relief_max_prize_bps":  s.BankRecoveryReliefMaxPrizeBps,
		"bank_recovery_pace_counter":          s.BankRecoveryPaceCounter,
		"daily_pool_enabled":                  s.DailyPoolEnabled,
		"daily_pool_nanoton":                  s.DailyPoolNanoton,
		"daily_pool_max_prize_bps":            s.DailyPoolMaxPrizeBps,
		"daily_pool_daily_refill_nanoton":     s.DailyPoolDailyRefillNanoton,
		"daily_pool_last_refill_date":         s.DailyPoolLastRefillDate,
		"promo_pool_enabled":                  s.PromoPoolEnabled,
		"promo_pool_nanoton":                  s.PromoPoolNanoton,
		"promo_pool_max_prize_bps":            s.PromoPoolMaxPrizeBps,
		"promo_pool_daily_refill_nanoton":     s.PromoPoolDailyRefillNanoton,
		"promo_pool_last_refill_date":         s.PromoPoolLastRefillDate,
		"updated_at":                          s.UpdatedAt,
	}
}

func (r *CaseRepo) ApplyCasePoolDelta(ctx context.Context, kind domain.CasePoolKind, delta int64) (*domain.CaseCatalogSettings, error) {
	var out domain.CaseCatalogSettings
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var settings domain.CaseCatalogSettings
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&settings, "id = ?", 1).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				settings = domain.CaseCatalogSettings{
					ID:                            1,
					Enabled:                       true,
					BankLossThresholdNanoton:      -50_000_000_000,
					BankBiasWeight:                50,
					BankMaxPrizeBps:               5000,
					BankRecoverySmoothEnabled:     true,
					BankRecoveryDrainOpens:        2,
					BankRecoveryReliefOpens:       1,
					BankRecoveryReliefMaxPrizeBps: 3000,
					DailyPoolMaxPrizeBps:          5000,
					PromoPoolMaxPrizeBps:          5000,
					UpdatedAt:                     time.Now().UTC(),
				}
				if createErr := tx.Create(&settings).Error; createErr != nil {
					return createErr
				}
				if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&settings, "id = ?", 1).Error; err != nil {
					return err
				}
			} else {
				return err
			}
		}
		r.applyDailyRefillsLocked(&settings, time.Now().UTC())
		switch kind {
		case domain.CasePoolDaily:
			settings.DailyPoolNanoton += delta
		case domain.CasePoolPromo:
			settings.PromoPoolNanoton += delta
		default:
			settings.BankNanoton += delta
		}
		domain.SyncCaseBankHysteresis(&settings)
		settings.UpdatedAt = time.Now().UTC()
		if err := tx.Model(&domain.CaseCatalogSettings{}).Where("id = ?", 1).Updates(catalogSettingsUpdateMap(&settings)).Error; err != nil {
			return err
		}
		out = settings
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *CaseRepo) AdvancePaidRecoveryPace(ctx context.Context) (*domain.CaseCatalogSettings, error) {
	var out domain.CaseCatalogSettings
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var settings domain.CaseCatalogSettings
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&settings, "id = ?", 1).Error; err != nil {
			return err
		}
		wasActive := settings.BankRecoveryActive
		domain.SyncCaseBankHysteresis(&settings)
		if wasActive && settings.BankRecoveryActive {
			domain.AdvancePaidRecoveryPace(&settings)
		}
		settings.UpdatedAt = time.Now().UTC()
		if err := tx.Model(&domain.CaseCatalogSettings{}).Where("id = ?", 1).Updates(catalogSettingsUpdateMap(&settings)).Error; err != nil {
			return err
		}
		out = settings
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// applyDailyRefillsLocked tops up daily/promo pools once per UTC day when configured.
func (r *CaseRepo) applyDailyRefillsLocked(settings *domain.CaseCatalogSettings, now time.Time) {
	if settings == nil {
		return
	}
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if settings.DailyPoolEnabled && settings.DailyPoolDailyRefillNanoton > 0 {
		if settings.DailyPoolLastRefillDate == nil || settings.DailyPoolLastRefillDate.Before(today) {
			settings.DailyPoolNanoton += settings.DailyPoolDailyRefillNanoton
			settings.DailyPoolLastRefillDate = &today
		}
	}
	if settings.PromoPoolEnabled && settings.PromoPoolDailyRefillNanoton > 0 {
		if settings.PromoPoolLastRefillDate == nil || settings.PromoPoolLastRefillDate.Before(today) {
			settings.PromoPoolNanoton += settings.PromoPoolDailyRefillNanoton
			settings.PromoPoolLastRefillDate = &today
		}
	}
}

func (r *CaseRepo) CaseOpenStats(ctx context.Context, since *time.Time) (*domain.CaseOpenStats, error) {
	type row struct {
		OpensCount        int64
		SpentNanoton      int64
		PrizeTotalNanoton int64
	}
	var agg row
	q := r.db.WithContext(ctx).Model(&domain.CaseOpen{}).
		Select("COUNT(*) AS opens_count, COALESCE(SUM(price_paid_nanoton),0) AS spent_nanoton, COALESCE(SUM(prize_nanoton),0) AS prize_total_nanoton")
	if since != nil {
		q = q.Where("created_at >= ?", *since)
	}
	if err := q.Scan(&agg).Error; err != nil {
		return nil, err
	}
	stats := &domain.CaseOpenStats{
		OpensCount:        agg.OpensCount,
		SpentNanoton:      agg.SpentNanoton,
		PrizeTotalNanoton: agg.PrizeTotalNanoton,
		HouseEdgeNanoton:  agg.SpentNanoton - agg.PrizeTotalNanoton,
	}
	if agg.SpentNanoton > 0 {
		stats.ActualRTPBPS = int((agg.PrizeTotalNanoton * 10000) / agg.SpentNanoton)
	}
	return stats, nil
}

func (r *CaseRepo) CaseOpenPeriodStats(ctx context.Context, since time.Time) (domain.CaseOpenPeriodStats, error) {
	type row struct {
		Opens             int64
		UniqueUsers       int64
		SpentNanoton      int64
		PrizeTotalNanoton int64
		PaidOpens         int64
		FreeOpens         int64
		PaidSpentNanoton  int64
		PaidPrizeNanoton  int64
	}
	var out row
	q := r.db.WithContext(ctx).Model(&domain.CaseOpen{}).
		Select(`COUNT(*) AS opens,
			COUNT(DISTINCT user_id) AS unique_users,
			COALESCE(SUM(price_paid_nanoton), 0) AS spent_nanoton,
			COALESCE(SUM(prize_nanoton), 0) AS prize_total_nanoton,
			COUNT(*) FILTER (WHERE price_paid_nanoton > 0) AS paid_opens,
			COUNT(*) FILTER (WHERE price_paid_nanoton = 0) AS free_opens,
			COALESCE(SUM(price_paid_nanoton) FILTER (WHERE price_paid_nanoton > 0), 0) AS paid_spent_nanoton,
			COALESCE(SUM(prize_nanoton) FILTER (WHERE price_paid_nanoton > 0), 0) AS paid_prize_nanoton`)
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since.UTC())
	}
	if err := q.Scan(&out).Error; err != nil {
		return domain.CaseOpenPeriodStats{}, err
	}
	return domain.CaseOpenPeriodStats{
		Opens:             out.Opens,
		UniqueUsers:       out.UniqueUsers,
		SpentNanoton:      out.SpentNanoton,
		PrizeTotalNanoton: out.PrizeTotalNanoton,
		PaidOpens:         out.PaidOpens,
		FreeOpens:         out.FreeOpens,
		PaidSpentNanoton:  out.PaidSpentNanoton,
		PaidPrizeNanoton:  out.PaidPrizeNanoton,
	}, nil
}

func (r *CaseRepo) CaseOpenSourceStats(ctx context.Context, since time.Time) ([]domain.CaseOpenSourceStats, error) {
	type row struct {
		Source            string
		Opens             int64
		UniqueUsers       int64
		SpentNanoton      int64
		PrizeTotalNanoton int64
	}
	var rows []row
	q := r.db.WithContext(ctx).Model(&domain.CaseOpen{}).
		Select(`source,
			COUNT(*) AS opens,
			COUNT(DISTINCT user_id) AS unique_users,
			COALESCE(SUM(price_paid_nanoton), 0) AS spent_nanoton,
			COALESCE(SUM(prize_nanoton), 0) AS prize_total_nanoton`).
		Group("source").
		Order("source ASC")
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since.UTC())
	}
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]domain.CaseOpenSourceStats, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.CaseOpenSourceStats{
			Source:            item.Source,
			Opens:             item.Opens,
			UniqueUsers:       item.UniqueUsers,
			SpentNanoton:      item.SpentNanoton,
			PrizeTotalNanoton: item.PrizeTotalNanoton,
		})
	}
	return out, nil
}

func (r *CaseRepo) CaseOpenPrizeTypeStats(ctx context.Context, since time.Time) ([]domain.CaseOpenPrizeTypeStats, error) {
	type row struct {
		PrizeType         string
		Opens             int64
		PrizeTotalNanoton int64
	}
	var rows []row
	q := r.db.WithContext(ctx).Model(&domain.CaseOpen{}).
		Select(`COALESCE(NULLIF(prize_type, ''), 'gift') AS prize_type,
			COUNT(*) AS opens,
			COALESCE(SUM(prize_nanoton), 0) AS prize_total_nanoton`).
		Group("COALESCE(NULLIF(prize_type, ''), 'gift')").
		Order("opens DESC")
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since.UTC())
	}
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]domain.CaseOpenPrizeTypeStats, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.CaseOpenPrizeTypeStats{
			PrizeType:         item.PrizeType,
			Opens:             item.Opens,
			PrizeTotalNanoton: item.PrizeTotalNanoton,
		})
	}
	return out, nil
}

func (r *CaseRepo) CaseOpenByCaseStats(ctx context.Context, since time.Time, limit int) ([]domain.CaseOpenCaseStats, error) {
	if limit <= 0 {
		limit = 15
	}
	type row struct {
		CaseID            uuid.UUID
		Title             string
		Slug              string
		Opens             int64
		SpentNanoton      int64
		PrizeTotalNanoton int64
	}
	var rows []row
	q := r.db.WithContext(ctx).
		Table("case_opens AS o").
		Select(`o.case_id,
			COALESCE(NULLIF(c.title, ''), '—') AS title,
			COALESCE(c.slug, '') AS slug,
			COUNT(*) AS opens,
			COALESCE(SUM(o.price_paid_nanoton), 0) AS spent_nanoton,
			COALESCE(SUM(o.prize_nanoton), 0) AS prize_total_nanoton`).
		Joins("LEFT JOIN cases c ON c.id = o.case_id").
		Group("o.case_id, c.title, c.slug").
		Order("opens DESC, spent_nanoton DESC").
		Limit(limit)
	if !since.IsZero() {
		q = q.Where("o.created_at >= ?", since.UTC())
	}
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]domain.CaseOpenCaseStats, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.CaseOpenCaseStats{
			CaseID:            item.CaseID,
			Title:             item.Title,
			Slug:              item.Slug,
			Opens:             item.Opens,
			SpentNanoton:      item.SpentNanoton,
			PrizeTotalNanoton: item.PrizeTotalNanoton,
		})
	}
	return out, nil
}

func (r *CaseRepo) CaseOpenTopPrizes(ctx context.Context, since time.Time, limit int) ([]domain.CaseOpenPrizeHitStats, error) {
	if limit <= 0 {
		limit = 15
	}
	type row struct {
		LootEntryID       uuid.UUID
		Label             string
		PrizeType         string
		Hits              int64
		PrizeTotalNanoton int64
	}
	var rows []row
	q := r.db.WithContext(ctx).
		Table("case_opens AS o").
		Select(`o.loot_entry_id,
			COALESCE(NULLIF(e.display_name, ''), '—') AS label,
			COALESCE(NULLIF(o.prize_type, ''), NULLIF(e.prize_type, ''), 'gift') AS prize_type,
			COUNT(*) AS hits,
			COALESCE(SUM(o.prize_nanoton), 0) AS prize_total_nanoton`).
		Joins("LEFT JOIN case_loot_entries e ON e.id = o.loot_entry_id").
		Group("o.loot_entry_id, e.display_name, COALESCE(NULLIF(o.prize_type, ''), NULLIF(e.prize_type, ''), 'gift')").
		Order("hits DESC, prize_total_nanoton DESC").
		Limit(limit)
	if !since.IsZero() {
		q = q.Where("o.created_at >= ?", since.UTC())
	}
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]domain.CaseOpenPrizeHitStats, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.CaseOpenPrizeHitStats{
			LootEntryID:       item.LootEntryID,
			Label:             item.Label,
			PrizeType:         item.PrizeType,
			Hits:              item.Hits,
			PrizeTotalNanoton: item.PrizeTotalNanoton,
		})
	}
	return out, nil
}

func (r *CaseRepo) CaseOpenByDay(ctx context.Context, since time.Time) ([]domain.CaseOpenDailyStats, error) {
	type row struct {
		Day               time.Time
		Opens             int64
		UniqueUsers       int64
		SpentNanoton      int64
		PrizeTotalNanoton int64
	}
	var rows []row
	q := r.db.WithContext(ctx).Model(&domain.CaseOpen{}).
		Select(`date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
			COUNT(*) AS opens,
			COUNT(DISTINCT user_id) AS unique_users,
			COALESCE(SUM(price_paid_nanoton), 0) AS spent_nanoton,
			COALESCE(SUM(prize_nanoton), 0) AS prize_total_nanoton`).
		Group("day").
		Order("day ASC")
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since.UTC())
	}
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]domain.CaseOpenDailyStats, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.CaseOpenDailyStats{
			Date:              item.Day.UTC(),
			Opens:             item.Opens,
			UniqueUsers:       item.UniqueUsers,
			SpentNanoton:      item.SpentNanoton,
			PrizeTotalNanoton: item.PrizeTotalNanoton,
		})
	}
	return out, nil
}

func (r *CaseRepo) GetLiveFeedSettings(ctx context.Context) (*domain.CaseLiveFeedSettings, error) {
	var row domain.CaseLiveFeedSettings
	err := r.db.WithContext(ctx).First(&row, "id = ?", 1).Error
	if err == nil {
		return &row, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}
	row = defaultLiveFeedSettings()
	if createErr := r.db.WithContext(ctx).Create(&row).Error; createErr != nil {
		return nil, createErr
	}
	return &row, nil
}

func (r *CaseRepo) UpdateLiveFeedSettings(ctx context.Context, settings *domain.CaseLiveFeedSettings) error {
	settings.ID = 1
	settings.UpdatedAt = time.Now().UTC()
	// Select forces zero-values (e.g. fill_when_sparse=false) into the INSERT.
	// Without it GORM skips fields that match their `default:` tag, so Postgres
	// writes DEFAULT true and ON CONFLICT keeps the option stuck on.
	cols := []string{
		"id", "enabled", "intensity", "fill_when_sparse", "min_visible",
		"common_weight", "uncommon_weight", "rare_weight", "epic_weight", "legendary_weight",
		"common_max_nanoton", "uncommon_max_nanoton", "rare_max_nanoton", "epic_max_nanoton",
		"fat_chance", "fat_min_floor_nanoton", "updated_at",
	}
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns(cols[1:]), // skip primary key
	}).Select(cols).Create(settings).Error
}

func defaultLiveFeedSettings() domain.CaseLiveFeedSettings {
	return domain.CaseLiveFeedSettings{
		ID:                 1,
		Enabled:            false,
		Intensity:          1,
		FillWhenSparse:     true,
		MinVisible:         6,
		CommonWeight:       50,
		UncommonWeight:     25,
		RareWeight:         15,
		EpicWeight:         7,
		LegendaryWeight:    3,
		CommonMaxNanoton:   500_000_000,
		UncommonMaxNanoton: 1_500_000_000,
		RareMaxNanoton:     3_000_000_000,
		EpicMaxNanoton:     5_000_000_000,
		FatChance:          0.08,
		FatMinFloorNanoton: 5_000_000_000,
		UpdatedAt:          time.Now().UTC(),
	}
}

func (r *CaseRepo) ListCasePromoCodes(ctx context.Context, caseID *uuid.UUID) ([]domain.CasePromoCode, error) {
	var rows []domain.CasePromoCode
	q := r.db.WithContext(ctx).Order("created_at DESC")
	if caseID != nil && *caseID != uuid.Nil {
		q = q.Where("case_id = ?", *caseID)
	}
	return rows, q.Find(&rows).Error
}

func (r *CaseRepo) GetCasePromoCode(ctx context.Context, code string) (*domain.CasePromoCode, error) {
	var row domain.CasePromoCode
	err := r.db.WithContext(ctx).First(&row, "code = ?", code).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrPromoInvalid
	}
	return &row, err
}

func (r *CaseRepo) UpsertCasePromoCode(ctx context.Context, promo *domain.CasePromoCode) error {
	if promo.CreatedAt.IsZero() {
		promo.CreatedAt = time.Now().UTC()
	}
	return r.db.WithContext(ctx).Save(promo).Error
}

func (r *CaseRepo) DeleteCasePromoCode(ctx context.Context, code string) error {
	var count int64
	if err := r.db.WithContext(ctx).Model(&domain.CasePromoRedemption{}).
		Where("code = ?", code).
		Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return domain.ErrPromoInUse
	}
	res := r.db.WithContext(ctx).Delete(&domain.CasePromoCode{}, "code = ?", code)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *CaseRepo) HasRedeemedCasePromoCode(ctx context.Context, userID uuid.UUID, code string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.CasePromoRedemption{}).
		Where("user_id = ? AND code = ?", userID, code).
		Count(&count).Error
	return count > 0, err
}

func (r *CaseRepo) CreateCasePromoRedemption(ctx context.Context, redemption *domain.CasePromoRedemption) error {
	if redemption.ID == uuid.Nil {
		redemption.ID = uuid.New()
	}
	if redemption.CreatedAt.IsZero() {
		redemption.CreatedAt = time.Now().UTC()
	}
	return r.db.WithContext(ctx).Create(redemption).Error
}

func (r *CaseRepo) IncrementCasePromoUsed(ctx context.Context, code string) error {
	res := r.db.WithContext(ctx).Model(&domain.CasePromoCode{}).
		Where("code = ? AND (max_uses = 0 OR used_count < max_uses)", code).
		UpdateColumn("used_count", gorm.Expr("used_count + 1"))
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrPromoExhausted
	}
	return nil
}

var _ domain.CaseRepository = (*CaseRepo)(nil)

func (r *InventoryRepo) TakeHouseGiftForCollection(ctx context.Context, botUserID, toUserID uuid.UUID, collectionSlug, backdrop string) (*domain.InventoryItem, error) {
	return r.takeHouseGift(ctx, botUserID, toUserID, collectionSlug, "", backdrop)
}

func (r *InventoryRepo) TakeHouseGiftForModel(ctx context.Context, botUserID, toUserID uuid.UUID, collectionSlug, modelName, backdrop string) (*domain.InventoryItem, error) {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return nil, gorm.ErrRecordNotFound
	}
	return r.takeHouseGift(ctx, botUserID, toUserID, collectionSlug, modelName, backdrop)
}

func (r *InventoryRepo) HasHouseGift(ctx context.Context, botUserID uuid.UUID, collectionSlug, modelName, backdrop string) (bool, error) {
	q := r.db.WithContext(ctx).Model(&domain.InventoryItem{}).
		Where("user_id = ? AND LOWER(collection_slug) = LOWER(?) AND status IN ? AND telegram_gift_id <> ''",
			botUserID, collectionSlug, []domain.InventoryStatus{domain.InvAvailable, domain.InvLocked})
	if modelName = strings.TrimSpace(modelName); modelName != "" {
		q = q.Where("metadata->>'model' = ?", modelName)
	}
	if backdrop = strings.TrimSpace(backdrop); backdrop != "" {
		q = q.Where("LOWER(COALESCE(metadata->>'backdrop', '')) = LOWER(?)", backdrop)
	}
	var count int64
	if err := q.Limit(1).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *InventoryRepo) takeHouseGift(ctx context.Context, botUserID, toUserID uuid.UUID, collectionSlug, modelName, backdrop string) (*domain.InventoryItem, error) {
	var item domain.InventoryItem
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Available = free house stock; Locked = bot market listing (also used as case backing).
		q := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("user_id = ? AND LOWER(collection_slug) = LOWER(?) AND status IN ? AND telegram_gift_id <> ''",
				botUserID, collectionSlug, []domain.InventoryStatus{domain.InvAvailable, domain.InvLocked})
		if modelName != "" {
			q = q.Where("metadata->>'model' = ?", modelName)
		}
		if backdrop = strings.TrimSpace(backdrop); backdrop != "" {
			q = q.Where("LOWER(COALESCE(metadata->>'backdrop', '')) = LOWER(?)", backdrop)
		}
		res := q.Order("deposited_at ASC").Limit(1).Find(&item)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 || item.ID == uuid.Nil {
			return gorm.ErrRecordNotFound
		}
		now := time.Now().UTC()
		upd := tx.Model(&domain.InventoryItem{}).
			Where("id = ? AND user_id = ?", item.ID, botUserID).
			Updates(map[string]any{
				"user_id":    toUserID,
				"status":     domain.InvAvailable,
				"updated_at": now,
			})
		if upd.Error != nil {
			return upd.Error
		}
		if upd.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		// Case prize must leave the market — otherwise the listing stays active on a player-owned item.
		if err := tx.Model(&domain.MarketListing{}).
			Where("inventory_item_id = ? AND status = ?", item.ID, domain.ListingActive).
			Updates(map[string]any{
				"status":     domain.ListingCancelled,
				"updated_at": now,
			}).Error; err != nil {
			return err
		}
		item.UserID = toUserID
		item.Status = domain.InvAvailable
		item.UpdatedAt = now
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *InventoryRepo) BindTelegramGift(ctx context.Context, itemID uuid.UUID, telegramGiftID, imageURL string, metadata []byte, fulfillment, telegramTxRef string) error {
	updates := map[string]any{
		"telegram_gift_id": telegramGiftID,
		"updated_at":       time.Now().UTC(),
	}
	if telegramTxRef = strings.TrimSpace(telegramTxRef); telegramTxRef != "" {
		updates["telegram_tx_ref"] = telegramTxRef
	}
	if imageURL != "" {
		updates["image_url"] = imageURL
	}
	if len(metadata) > 0 {
		updates["metadata"] = metadata
	} else if fulfillment != "" {
		updates["metadata"] = []byte(fmt.Sprintf(`{"fulfillment":%q}`, fulfillment))
	}
	res := r.db.WithContext(ctx).Model(&domain.InventoryItem{}).Where("id = ?", itemID).Updates(updates)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
