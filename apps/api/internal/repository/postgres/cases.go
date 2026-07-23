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

func (r *CaseRepo) GetCatalogSettings(ctx context.Context) (*domain.CaseCatalogSettings, error) {
	var row domain.CaseCatalogSettings
	err := r.db.WithContext(ctx).First(&row, "id = ?", 1).Error
	if err == nil {
		return &row, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}
	row = domain.CaseCatalogSettings{ID: 1, BannersEnabled: false, UpdatedAt: time.Now().UTC()}
	if createErr := r.db.WithContext(ctx).Create(&row).Error; createErr != nil {
		return nil, createErr
	}
	return &row, nil
}

func (r *CaseRepo) UpdateCatalogSettings(ctx context.Context, settings *domain.CaseCatalogSettings) error {
	settings.ID = 1
	settings.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{"banners_enabled", "updated_at"}),
	}).Create(settings).Error
}

var _ domain.CaseRepository = (*CaseRepo)(nil)

func (r *InventoryRepo) TakeHouseGiftForCollection(ctx context.Context, botUserID, toUserID uuid.UUID, collectionSlug string) (*domain.InventoryItem, error) {
	var item domain.InventoryItem
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("user_id = ? AND collection_slug = ? AND status IN ? AND telegram_gift_id <> ''",
				botUserID, collectionSlug, []domain.InventoryStatus{domain.InvAvailable, domain.InvLocked}).
			Order("deposited_at ASC").
			Limit(1).
			Find(&item)
		if q.Error != nil {
			return q.Error
		}
		if q.RowsAffected == 0 || item.ID == uuid.Nil {
			return gorm.ErrRecordNotFound
		}
		now := time.Now().UTC()
		res := tx.Model(&domain.InventoryItem{}).
			Where("id = ? AND user_id = ?", item.ID, botUserID).
			Updates(map[string]any{
				"user_id":    toUserID,
				"status":     domain.InvAvailable,
				"updated_at": now,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
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

func (r *InventoryRepo) BindTelegramGift(ctx context.Context, itemID uuid.UUID, telegramGiftID, imageURL string, metadata []byte, fulfillment string) error {
	updates := map[string]any{
		"telegram_gift_id": telegramGiftID,
		"updated_at":       time.Now().UTC(),
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
